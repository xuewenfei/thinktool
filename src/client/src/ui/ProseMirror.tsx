import * as PS from "prosemirror-state";
import * as PV from "prosemirror-view";
import * as PM from "prosemirror-model";

import * as React from "react";

// Sometimes we want to pass a callback to some function that doesn't know about
// React, but which should still have access to the latest value of a prop
// passed to a component.
//
// This function lets us make the latest value of a prop available as a ref,
// which we can then dereference from inside such a callback.
//
// We use this when integrating with ProseMirror.
function usePropRef<T>(prop: T): React.RefObject<T> {
  const ref = React.useRef(prop);
  React.useEffect(() => {
    ref.current = prop;
  }, [prop]);
  return ref;
}

// To improve responsiveness, the state that is actually used by the rendered
// component is not always the same as the given state prop.
//
// Whenever the user makes a change inside the editor, that transaction is
// *first* applied locally, and then `onStateUpdated` is called with the
// resulting state.
//
// Our state is then updated again whenever the prop changes, but not until
// then.

export default function ProseMirror<Schema extends PM.Schema>(props: {
  state: PS.EditorState<Schema>;
  onStateUpdated(state: PS.EditorState<Schema>, args: {focused: boolean}): void;
  hasFocus: boolean;
}) {
  const onStateUpdatedRef = usePropRef(props.onStateUpdated);

  const editorViewRef = React.useRef<PV.EditorView<Schema> | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function dispatchTransaction(this: PV.EditorView<Schema>, transaction: PS.Transaction<Schema>) {
      const newState = this.state.apply(transaction);
      this.updateState(newState);
      onStateUpdatedRef.current!(newState, {focused: this.hasFocus()});
    }

    editorViewRef.current = new PV.EditorView(ref.current!, {state: props.state, dispatchTransaction});
  }, []);

  React.useEffect(() => {
    if (props.hasFocus) editorViewRef.current!.focus();
  }, [props.hasFocus]);

  React.useEffect(() => {
    if (props.hasFocus && !editorViewRef.current!.hasFocus()) editorViewRef.current!.focus(); // Restore focus after inserting link from poup

    editorViewRef.current?.updateState(props.state);
  }, [props.hasFocus, props.state]);

  return <div className="editor content" ref={ref}></div>;
}
