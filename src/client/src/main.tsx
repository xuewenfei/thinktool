import {Communication} from "@thinktool/shared";

import * as ChangelogData from "./changes.json";

import {State} from "./data";
import {Context, DragInfo, setAppState} from "./context";
import {extractThingFromURL, useThingUrl} from "./url";
import {useBatched} from "./batched";

import * as Data from "./data";
import * as T from "./tree";
import * as Tutorial from "./tutorial";
import * as API from "./server-api";
import * as Storage from "./storage";
import * as Actions from "./actions";
import * as Sh from "./shortcuts";
import * as A from "./app";

import * as Editor from "./ui/Editor";
import {usePopup} from "./ui/ThingSelectPopup";
import Toolbar from "./ui/Toolbar";
import Changelog from "./ui/Changelog";
import Splash from "./ui/Splash";
import {ExternalLinkProvider, ExternalLink, ExternalLinkType} from "./ui/ExternalLink";
import * as Item from "./ui/Item";
import UserPage from "./ui/UserPage";
import * as PlaceholderItem from "./ui/PlaceholderItem";
import {OtherParents, useOtherParents} from "./ui/OtherParents";

import * as React from "react";
import * as ReactDOM from "react-dom";

import {Receiver, receiver as createReceiver} from "./receiver";
import {Message} from "./messages";
import {usePropRef} from "./react-utils";
import * as SelectedItem from "./ui/SelectedItem";

function useContext({
  initialState,
  initialTutorialFinished,
  storage,
  server,
  openExternalUrl,
  receiver,
}: {
  initialState: State;
  initialTutorialFinished: boolean;
  storage: Storage.Storage;
  server?: API.Server;
  openExternalUrl(url: string): void;
  receiver: Receiver<Message>;
}): Context {
  const [innerApp, setInnerApp] = React.useState<A.App>(
    A.from(initialState, T.fromRoot(initialState, extractThingFromURL()), {
      tutorialFinished: initialTutorialFinished,
    }),
  );
  const [drag, setDrag] = React.useState({current: null, target: null} as DragInfo);

  const batched = useBatched(200);

  const context: Context = {
    setApp(app: A.App) {
      // Push changes to server
      const effects = Storage.Diff.effects(innerApp, app);
      Storage.execute(storage, effects, {
        setContent(thing, content) {
          batched.update(thing, () => {
            storage.setContent(thing, content);
          });
        },
      });

      // Update actual app
      setInnerApp(app);
    },

    get state() {
      return innerApp.state;
    },
    get tree() {
      return innerApp.tree;
    },
    get tutorialState() {
      return innerApp.tutorialState;
    },
    get changelogShown() {
      return innerApp.changelogShown;
    },
    get editors() {
      return innerApp.editors;
    },

    // [TODO] Do we actually need this?
    updateLocalState(update) {
      setInnerApp((innerApp) => {
        const state = update(innerApp.state);
        const tree = T.refresh(innerApp.tree, state);
        return A.merge(innerApp, {state, tree});
      });
    },

    drag,
    setDrag,

    changelog: ChangelogData,
    storage,
    server,
    openExternalUrl,
    send: receiver.send,

    setTree(tree) {
      context.setApp(A.merge(context, {tree}));
    },

    setState(state) {
      context.setApp(A.merge(context, {state}));
    },

    setEditors(editors) {
      context.setApp(A.merge(context, editors));
    },
  };

  useThingUrl({
    current: T.thing(context.tree, T.root(context.tree)),
    jump(thing: string) {
      context.setTree(T.fromRoot(context.state, thing));
    },
  });

  return context;
}

function App_({
  initialState,
  initialTutorialFinished,
  username,
  storage,
  server,
  openExternalUrl,
}: {
  initialState: State;
  initialTutorialFinished: boolean;
  username?: string;
  storage: Storage.Storage;
  server?: API.Server;
  openExternalUrl(url: string): void;
}) {
  const receiver = React.useRef(createReceiver<Message>());

  React.useEffect(() => {
    receiver.current.subscribe("action", async (ev) => {
      setAppState(
        contextRef.current,
        await Actions.execute(contextRef.current, ev.action, {
          input: popup.input,
          openUrl: context.openExternalUrl,
        }),
      );
    });
  }, []);

  const send = receiver.current.send;

  const context = useContext({
    initialState,
    initialTutorialFinished,
    storage,
    server,
    openExternalUrl,
    receiver: receiver.current,
  });

  const popup = usePopup(context);

  const contextRef = React.useRef(context);
  React.useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // If the same user is connected through multiple clients, we want to be able
  // to see changes from other clients on this one.
  //
  // The server makes a websocket available on /api/changes, which notifies us
  // when there are pending changes from another client.

  // [TODO] Theoretically, this should be rerun when context.updateLocalState
  // changes, but for some reason just putting context.updateLocalState in the
  // dependencies makes it reconnect every time any change is made to the state
  // (e.g. editing the content of an item).
  React.useEffect(() => {
    if (context.server === undefined) return;

    return context.server.onChanges(async (changes) => {
      for (const changedThing of changes) {
        const thingData = await context.server!.getThingData(changedThing);

        if (thingData === null) {
          // Thing was deleted
          context.updateLocalState((state) => Data.remove(state, changedThing));
          continue;
        }

        context.updateLocalState((state) => {
          let newState = state;

          if (!Data.exists(newState, changedThing)) {
            // A new item was created
            newState = Data.create(newState, changedThing)[0];
          }

          newState = Data.setContent(newState, changedThing, thingData.content);

          if (Data.isPage(newState, changedThing) !== thingData.isPage) {
            newState = Data.togglePage(newState, changedThing);
          }

          const nChildren = Data.children(newState, changedThing).length;
          for (let i = 0; i < nChildren; ++i) {
            newState = Data.removeChild(newState, changedThing, 0);
          }
          for (const childConnection of thingData.children) {
            newState = Data.addChild(newState, changedThing, childConnection.child, childConnection.name)[0];
          }

          return newState;
        });
      }
    });
  }, []);

  document.onkeydown = (ev) => {
    if (Sh.matches(ev, Actions.shortcut("undo"))) {
      context.send("action", {action: "undo"});
      ev.preventDefault();
    } else if (Sh.matches(ev, Actions.shortcut("find"))) {
      context.send("action", {action: "find"});
      ev.preventDefault();
    }
  };

  React.useEffect(() => {
    if (context.drag.current === null) return;

    function mousemove(ev: MouseEvent): void {
      const [x, y] = [ev.clientX, ev.clientY];

      let element: HTMLElement | null | undefined = document.elementFromPoint(x, y) as HTMLElement;
      while (element && !element.classList.contains("item")) {
        element = element?.parentElement;
      }

      if (element != null) {
        const targetId = +element.dataset.id!;
        if (targetId !== context.drag.target?.id)
          context.setDrag({current: context.drag.current, target: {id: targetId}, finished: false});
      }
    }

    function touchmove(ev: TouchEvent): void {
      const [x, y] = [ev.changedTouches[0].clientX, ev.changedTouches[0].clientY];

      let element: HTMLElement | null | undefined = document.elementFromPoint(x, y) as HTMLElement;
      while (element && !element.classList.contains("item")) {
        element = element?.parentElement;
      }

      if (element != null) {
        const targetId = +element.dataset.id!;
        if (targetId !== context.drag.target?.id)
          context.setDrag({current: context.drag.current, target: {id: targetId}, finished: false});
      }
    }

    window.addEventListener("mousemove", mousemove);
    window.addEventListener("touchmove", touchmove);

    function mouseup(ev: MouseEvent | TouchEvent): void {
      context.setDrag({...context.drag, finished: ev.ctrlKey ? "copy" : true});
    }

    window.addEventListener("mouseup", mouseup);
    window.addEventListener("touchend", mouseup);

    return () => {
      window.removeEventListener("mousemove", mousemove);
      window.removeEventListener("touchmove", touchmove);
      window.removeEventListener("mouseup", mouseup);
      window.removeEventListener("touchend", mouseup);
    };
  }, [context.drag]);

  React.useEffect(() => {
    if (context.drag.finished) {
      if (context.drag.current !== null && context.drag.target !== null && context.drag.current.id !== null) {
        if (context.drag.finished === "copy") {
          const [newState, newTree, newId] = T.copyToAbove(
            context.state,
            context.tree,
            context.drag.current,
            context.drag.target,
          );
          context.setState(newState);
          context.setTree(T.focus(newTree, newId));
        } else {
          const [newState, newTree] = T.moveToAbove(
            context.state,
            context.tree,
            context.drag.current,
            context.drag.target,
          );
          context.setState(newState);
          context.setTree(newTree);
        }
      }

      context.setDrag({current: null, target: null, finished: false});
    }
  }, [context.drag]);

  const [toolbarShown, setToolbarShown] = React.useState<boolean>(true);

  const appRef = React.useRef<HTMLDivElement>(null);

  const [showSplash, setShowSplash] = React.useState<boolean>(Tutorial.isActive(context.tutorialState));

  return (
    <div
      ref={appRef}
      id="app"
      spellCheck={false}
      onFocus={(ev) => {
        if (ev.target === appRef.current) {
          console.log("Unfocusing item due to click on background");
          context.setTree(T.unfocus(context.tree));
        }
      }}
      tabIndex={-1}
      className="app"
    >
      {popup.component}
      <div className="top-bar">
        <ExternalLink className="logo" href="/">
          Thinktool
        </ExternalLink>
        <button onClick={() => setToolbarShown(!toolbarShown)}>
          <i className="icon fas fa-bars" />
          {toolbarShown ? "Hide" : "Show"} Menu
        </button>
        <div id="current-user">
          {username && (
            <ExternalLink className="username" href="/user.html">
              {username}
            </ExternalLink>
          )}
          {context.server && (
            <a className="log-out" href={context.server.logOutUrl}>
              Log Out
            </a>
          )}
        </div>
      </div>
      {toolbarShown ? (
        <Toolbar
          executeAction={(action) => send("action", {action})}
          isEnabled={(action) => Actions.enabled(context, action)}
          isRelevant={(action) => Tutorial.isRelevant(context.tutorialState, action)}
          isNotIntroduced={(action) => Tutorial.isNotIntroduced(context.tutorialState, action)}
        />
      ) : null}
      {!showSplash && (
        <Tutorial.TutorialBox
          state={context.tutorialState}
          setState={(tutorialState) => setAppState(context, A.merge(context, {tutorialState}))}
        />
      )}
      <Changelog
        changelog={context.changelog}
        visible={context.changelogShown}
        hide={() => setAppState(context, A.merge(context, {changelogShown: false}))}
      />
      <ThingOverview context={context} />
      {showSplash && ReactDOM.createPortal(<Splash splashCompleted={() => setShowSplash(false)} />, document.body)}
    </div>
  );
}

function ThingOverview(p: {context: Context}) {
  const node = T.root(p.context.tree);

  const hasReferences = Data.backreferences(p.context.state, T.thing(p.context.tree, node)).length > 0;

  const onEditEvent = useOnEditEvent(p.context, node);

  return (
    <div className="overview">
      <ParentsOutline context={p.context} />
      <div className="overview-main">
        <SelectedItem.SelectedItem
          onEditEvent={onEditEvent}
          {...SelectedItem.useUnfold(p.context, useUpdateApp(p.context))}
          {...Editor.forNode(p.context, node)}
        />
        <div className="children">
          <Outline context={p.context} />
        </div>
      </div>
      {hasReferences && (
        <>
          <div className="references">
            <h1 className="link-section">References</h1>
            <ReferencesOutline context={p.context} />
          </div>
        </>
      )}
    </div>
  );
}

// TODO: ParentsOutline and ReferencesOutline should both have appropriate
// custom behavior in response to key-presses (e.g. Alt+Backspace in
// ParentsOutline should remove parent from child).

function ParentsOutline(p: {context: Context}) {
  const parentItems = T.otherParentsChildren(p.context.tree, T.root(p.context.tree)).map((child: T.NodeRef) => {
    return <ExpandableItem key={child.id} node={child} context={p.context} />;
  });

  const subtree = <ul className="subtree">{parentItems}</ul>;

  if (parentItems.length === 0) {
    return null;
  } else {
    return (
      <div className="parents">
        <h1 className="link-section">Parents</h1>
        {subtree}
      </div>
    );
  }
}

function ReferencesOutline(p: {context: Context}) {
  const referenceItems = T.backreferencesChildren(p.context.tree, T.root(p.context.tree)).map(
    (child: T.NodeRef) => {
      return <ExpandableItem key={child.id} node={child} context={p.context} />;
    },
  );

  if (referenceItems.length === 0) {
    return null;
  } else {
    return <ul className="subtree">{referenceItems}</ul>;
  }
}

function Outline(p: {context: Context}) {
  return (
    <Subtree context={p.context} parent={T.root(p.context.tree)} omitReferences={true}>
      {PlaceholderItem.isVisible(p.context) && (
        <PlaceholderItem.PlaceholderItem
          onCreate={() => setAppState(p.context, PlaceholderItem.create(p.context))}
        />
      )}
    </Subtree>
  );
}

function handleEditorEvent(context: Context, node: T.NodeRef, event: Editor.Event) {
  const result = Editor.handling(context, node)(event);

  if (result.handled) {
    setAppState(context, result.app);
  } else if (event.tag === "action") {
    context.send("action", {action: event.action});
  } else if (event.tag === "openUrl") {
    context.openExternalUrl(event.url);
  } else {
    console.error("Unhandled event from editor: %o", event);
  }
}

function useOnEditEvent(context: Context, node: T.NodeRef): (ev: Editor.Event) => void {
  // We don't want to update all editors each time context changes. Editor will
  // not update if none of its props have changed. To ensure that this condition
  // is met, we always pass the same callback.
  const contextRef = usePropRef(context);
  return React.useCallback((ev: Editor.Event) => handleEditorEvent(contextRef.current!, node, ev), [node]);
}

function useUpdateApp(context: Context): (f: (app: A.App) => A.App) => void {
  // Speculative optimization. I haven't tested the impact of this.
  const contextRef = usePropRef(context);
  const updateApp = React.useMemo(
    () => (f: (app: A.App) => A.App) => setAppState(contextRef.current!, f(contextRef.current!)),
    [],
  );
  return updateApp;
}

function ExpandableItem(props: {context: Context; node: T.NodeRef; parent?: T.NodeRef}) {
  const updateApp = useUpdateApp(props.context);

  const otherParents = useOtherParents({app: props.context, updateApp, node: props.node, parent: props.parent});

  // Avoid changing callbacks to <Bullet> between rerenders so we can avoid
  // rerendering bullet:
  const contextRef = usePropRef(props.context);
  const beginDrag = React.useCallback(
    () => contextRef.current!.setDrag({current: props.node, target: null, finished: false}),
    [props.node],
  );
  const onBulletClick = React.useCallback(() => {
    updateApp((app) => Item.click(app, props.node));
  }, [props.node]);
  const onBulletAltClick = React.useCallback(() => {
    updateApp((app) => Item.altClick(app, props.node));
  }, [props.node]);

  const subtree = <Subtree context={props.context} parent={props.node} grandparent={props.parent} />;

  const onEditEvent = useOnEditEvent(props.context, props.node);
  const content = <Editor.Editor {...Editor.forNode(props.context, props.node)} onEvent={onEditEvent} />;

  return (
    <Item.Item
      dragState={Item.dragState(props.context.drag, props.node)}
      status={Item.status(props.context.tree, props.node)}
      onBulletClick={onBulletClick}
      onBulletAltClick={onBulletAltClick}
      id={props.node.id}
      beginDrag={beginDrag}
      kind={Item.kind(props.context.tree, props.node)}
      otherParents={<OtherParents {...otherParents} />}
      subtree={subtree}
      content={content}
    />
  );
}

function BackreferencesItem(p: {context: Context; parent: T.NodeRef}) {
  const backreferences = Data.backreferences(p.context.state, T.thing(p.context.tree, p.parent));

  if (backreferences.length === 0) {
    return null;
  }

  const children = T.backreferencesChildren(p.context.tree, p.parent).map((child) => {
    return <ExpandableItem key={child.id} node={child} context={p.context} />;
  });

  return (
    <>
      <li className="item">
        <div>
          <button
            onClick={() => p.context.setTree(T.toggleBackreferences(p.context.state, p.context.tree, p.parent))}
            className="backreferences-text"
          >
            {backreferences.length} References
            {!T.backreferencesExpanded(p.context.tree, p.parent) && "..."}
          </button>
        </div>
      </li>
      {T.backreferencesExpanded(p.context.tree, p.parent) && children}
    </>
  );
}

function Subtree(p: {
  context: Context;
  parent: T.NodeRef;
  grandparent?: T.NodeRef;
  children?: React.ReactNode[] | React.ReactNode;
  omitReferences?: boolean;
}) {
  const children = T.children(p.context.tree, p.parent).map((child) => {
    return <ExpandableItem key={child.id} node={child} parent={p.parent} context={p.context} />;
  });

  const openedLinksChildren = T.openedLinksChildren(p.context.tree, p.parent).map((child) => {
    return <ExpandableItem key={child.id} node={child} parent={p.parent} context={p.context} />;
  });

  return (
    <ul className="subtree">
      {openedLinksChildren}
      {children}
      {p.children}
      {!p.omitReferences && <BackreferencesItem key="backreferences" parent={p.parent} context={p.context} />}
    </ul>
  );
}

// ==

export function LocalApp(props: {
  storage: Storage.Storage;
  ExternalLink: ExternalLinkType;
  openExternalUrl: (url: string) => void;
}) {
  const [app, setApp] = React.useState<JSX.Element>(<div>Loading...</div>);

  React.useEffect(() => {
    (async () => {
      setApp(
        <ExternalLinkProvider value={props.ExternalLink}>
          <App_
            initialState={API.transformFullStateResponseIntoState(await props.storage.getFullState())}
            initialTutorialFinished={await props.storage.getTutorialFinished()}
            storage={props.storage}
            openExternalUrl={props.openExternalUrl}
          />
        </ExternalLinkProvider>,
      );
    })();
  }, []);

  return app;
}

export function App({apiHost}: {apiHost: string}) {
  const server = API.initialize(apiHost);

  const [app, setApp] = React.useState<JSX.Element>(<div>Loading...</div>);

  React.useEffect(() => {
    (async () => {
      const username = await server.getUsername();
      if (username === null) {
        console.log("Not logged in. Redirecting to login page.");
        window.location.href = "/login.html";
      }

      const storage = Storage.server(server);

      setApp(
        <App_
          initialState={API.transformFullStateResponseIntoState(await storage.getFullState())}
          initialTutorialFinished={await storage.getTutorialFinished()}
          username={username ?? "<error>"}
          storage={storage}
          server={server}
          openExternalUrl={(url) => window.open(url, "_blank")}
        />,
      );
    })();
  }, []);

  return app;
}

export function Demo(props: {data: Communication.FullStateResponse}) {
  return (
    <App_
      initialState={API.transformFullStateResponseIntoState(props.data)}
      initialTutorialFinished={false}
      storage={Storage.ignore()}
      openExternalUrl={(url) => window.open(url, "_blank")}
    />
  );
}

export function User(props: {apiHost: string}) {
  return <UserPage server={API.initialize(props.apiHost)} />;
}

export * as Storage from "./storage";
export {Communication} from "@thinktool/shared";
