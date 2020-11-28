import {Context} from "./context";
import * as T from "./tree";
import * as D from "./data";
import * as Tutorial from "./tutorial";
import * as S from "./shortcuts";
import * as Goal from "./goal";

export type ActionName =
  | "insert-sibling"
  | "insert-child"
  | "insert-parent"
  | "insert-link"
  | "find"
  | "new"
  | "new-before"
  | "focus-up"
  | "focus-down"
  | "zoom"
  | "indent"
  | "unindent"
  | "down"
  | "up"
  | "new-child"
  | "remove"
  | "destroy"
  | "tutorial"
  | "changelog"
  | "undo"
  | "toggle-type"
  | "toggle"
  | "home"
  | "forum";

// Some actions can only be executed under some circumstances, for example if an
// item is selected.
//
// If enabled(context, action) returns false, then the toolbar button for the
// given action should be disabled, and pressing the shortcut should not execute
// the action.
export function enabled(context: Context, action: ActionName): boolean {
  const alwaysEnabled: ActionName[] = ["find", "new", "changelog", "undo", "home", "forum"];
  const requireTarget: ActionName[] = [
    "zoom",
    "new-child",
    "remove",
    "destroy",
    "unindent",
    "indent",
    "up",
    "down",
    "insert-child",
    "insert-sibling",
    "insert-parent",
    "insert-link",
    "toggle-type",
    "new-before",
    "focus-up",
    "focus-down",
    "toggle",
  ];

  if (alwaysEnabled.includes(action)) {
    return true;
  } else if (requireTarget.includes(action)) {
    return T.focused(context.tree) !== null;
  } else if (action === "tutorial") {
    return !Tutorial.isActive(context.tutorialState);
  } else {
    console.warn("enabled(..., %o): Did not know about action.", action);
    return true;
  }
}

function tutorialAction(context: Context, event: Goal.ActionEvent) {
  context.setTutorialState(Tutorial.action(context.tutorialState, event));
}

export function execute(context: Context, action: ActionName): void {
  if (!enabled(context, action)) {
    console.error("The action %o is not enabled! Ignoring.", action);
    return;
  }

  function node(): T.NodeRef {
    const node = T.focused(context.tree);
    if (node === null) throw `Bug in 'enabled'. Ran action '${action}', even though there was no node selected.`;
    return node;
  }

  const implementation = implementations[action];
  if (typeof implementation !== "function")
    throw `Bug in 'execute'. Action '${action}' did not have an implementation.`;
  implementation(context, node);
}

const implementations: {
  [k: string]: ((context: Context, getFocused: () => T.NodeRef) => void) | undefined;
} = {
  "insert-sibling"(context, getFocused) {
    context.setPopupTarget(getFocused());
    context.setActivePopup((state, tree, target, selection) => {
      const [newState, newTree] = T.insertSiblingAfter(state, tree, target, selection);
      return [newState, newTree];
    });
  },

  "insert-child"(context, getFocused) {
    context.setPopupTarget(getFocused());
    context.setActivePopup((state, tree, target, selection) => {
      const [newState, newTree] = T.insertChild(state, tree, target, selection, 0);
      return [newState, newTree];
    });
  },

  "insert-parent"(context, getFocused) {
    context.setPopupTarget(getFocused());
    context.setActivePopup((state, tree, target, selection) => {
      const [newState, newTree] = T.insertParent(state, tree, target, selection);
      tutorialAction(context, {action: "inserted-parent", childNode: target, newState, newTree});
      return [newState, newTree];
    });
  },

  "insert-link"(context, getFocused) {
    const node = getFocused();

    context.setPopupTarget(node);
    context.setActivePopup((state, tree, target, selection) => {
      if (target !== node) console.error("Unexpected target/node");
      if (context.activeEditor === null) throw "No active editor.";
      tutorialAction(context, {action: "link-inserted"});
      context.activeEditor.replaceSelectionWithLink(selection, D.contentText(state, selection));
      return [state, tree];
    });
  },

  find(context) {
    // This is a hack on how setActivePopup is supposed to be used.
    const previouslyFocused = T.thing(context.tree, T.root(context.tree));
    context.setPopupTarget({id: 0});
    context.setActivePopup((state, tree, target, selection) => {
      context.setSelectedThing(selection);
      tutorialAction(context, {action: "found", previouslyFocused, thing: selection});
      return [state, tree];
    });
  },

  new(context, getFocused) {
    const node = T.focused(context.tree);
    if (node === null) {
      const [newState, newTree, _, newId] = T.createChild(context.state, context.tree, T.root(context.tree));
      context.setState(newState);
      context.setTree(T.focus(newTree, newId));
    } else {
      const [newState, newTree, _, newId] = T.createSiblingAfter(context.state, context.tree, node);
      context.setState(newState);
      context.setTree(T.focus(newTree, newId));
    }
    tutorialAction(context, {action: "created-item"});
  },

  "new-before"(context, getFocused) {
    const [newState, newTree, _, newId] = T.createSiblingBefore(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(T.focus(newTree, newId));
    tutorialAction(context, {action: "created-item"});
  },

  "focus-up"(context, getFocused) {
    context.setTree(T.focusUp(context.tree));
  },

  "focus-down"(context, getFocused) {
    context.setTree(T.focusDown(context.tree));
  },

  zoom(context, getFocused) {
    const previouslyFocused = T.thing(context.tree, T.root(context.tree));
    context.setSelectedThing(T.thing(context.tree, getFocused()));
    tutorialAction(context, {action: "jump", previouslyFocused, thing: T.thing(context.tree, getFocused())});
  },

  indent(context, getFocused) {
    const [newState, newTree] = T.indent(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(newTree);
  },

  unindent(context, getFocused) {
    const [newState, newTree] = T.unindent(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(newTree);
  },

  down(context, getFocused) {
    const [newState, newTree] = T.moveDown(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(newTree);
  },

  up(context, getFocused) {
    const [newState, newTree] = T.moveUp(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(newTree);
  },

  "new-child"(context, getFocused) {
    const [newState, newTree, _, newId] = T.createChild(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(T.focus(newTree, newId));
    tutorialAction(context, {action: "created-item"});
  },

  remove(context, getFocused) {
    const [newState, newTree] = T.remove(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(newTree);
    tutorialAction(context, {action: "removed"});
  },

  destroy(context, getFocused) {
    const [newState, newTree] = T.removeThing(context.state, context.tree, getFocused());
    context.setState(newState);
    context.setTree(newTree);
    tutorialAction(context, {action: "destroy"});
  },

  tutorial(context, getFocused) {
    context.setTutorialState(Tutorial.reset(context.tutorialState));
  },

  changelog(context, getFocused) {
    context.setChangelogShown(!context.changelogShown);
  },

  undo(context, getFocused) {
    context.undo();
  },

  "toggle-type"(context, getFocused) {
    const newState = D.togglePage(context.state, T.thing(context.tree, getFocused()));
    context.setState(newState);
  },

  toggle(context, getFocused) {
    const newTree = T.toggle(context.state, context.tree, getFocused());
    context.setTree(newTree);
    tutorialAction(context, {action: "toggled-item", newTree, node: getFocused()});
  },

  home(context, getFocused) {
    const newTree = T.fromRoot(context.state, "0");
    tutorialAction(context, {action: "home"});
    context.setTree(newTree);
  },

  forum(context, getFocused) {
    context.openExternalUrl("https://old.reddit.com/r/thinktool/");
  },
};

export function shortcut(action: ActionName): S.Shortcut {
  switch (action) {
    case "find":
      return {mod: true, key: "f"};
    case "indent":
      return {mod: true, secondaryMod: true, key: "ArrowRight"};
    case "unindent":
      return {mod: true, secondaryMod: true, key: "ArrowLeft"};
    case "up":
      return {mod: true, secondaryMod: true, key: "ArrowUp"};
    case "down":
      return {mod: true, secondaryMod: true, key: "ArrowDown"};
    case "new-child":
      return {mod: true, key: "Enter"};
    case "remove":
      return {mod: true, key: "Backspace"};
    case "destroy":
      return {mod: true, key: "Delete"};
    case "insert-child":
      return {mod: true, key: "c"};
    case "insert-parent":
      return {mod: true, key: "p"};
    case "insert-sibling":
      return {mod: true, key: "s"};
    case "insert-link":
      return {mod: true, key: "l"};
    case "toggle-type":
      return {mod: true, key: "t"};
    case "toggle":
      return {key: "Tab"};
    case "undo":
      return {ctrlLikeMod: true, key: "z"};
    case "new":
      return {key: "Enter"};
    case "new-before":
      return {key: "Enter", condition: "first-character"};
    case "focus-up":
      return {key: "ArrowUp", condition: "first-line"};
    case "focus-down":
      return {key: "ArrowDown", condition: "last-line"};
    case "zoom":
      return {special: "Middle click bullet"};
    default:
      return null;
  }
}

export const allActionsWithShortcuts: ActionName[] = [
  "indent",
  "unindent",
  "up",
  "down",
  "toggle",
  "focus-up",
  "focus-down",
  "new-child",
  "new-before",
  "new",
  "remove",
  "destroy",
  "insert-child",
  "insert-sibling",
  "insert-parent",
  "insert-link",
  "toggle-type",
];
