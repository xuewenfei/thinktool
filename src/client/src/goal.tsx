import {classes} from "@johv/miscjs";
import * as React from "react";

import * as D from "./data";
import * as T from "./tree";

export type ActionEvent =
  | {action: "created-item"}
  | {
      action: "inserted-parent";
      newState: D.State;
      newTree: T.Tree;
      childNode: T.NodeRef;
    }
  | {action: "toggled-item"; newTree: T.Tree; node: T.NodeRef};

export type GoalId =
  | "create-item"
  | "add-parent"
  | "expand-item"
  | "remove-item"
  | "delete-item"
  | "move-item"
  | "insert-link"
  | "expand-link"
  | "jump-item"
  | "jump-home"
  | "find-item";

type Goals = Map<GoalId, {title: string; doesComplete: (event: ActionEvent) => boolean}>;

export type State = {finished: Set<GoalId>};

const goals = (() => {
  const goals: Goals = new Map();

  // [TODO] Implement all goals with missing implementations.
  function notYetImplemented(event: ActionEvent) {
    return false;
  }

  goals.set("create-item", {
    title: "Create a new item.",
    doesComplete(event) {
      return event.action === "created-item";
    },
  });

  goals.set("add-parent", {
    title: "Add a second parent to an item.",
    doesComplete(event) {
      return (
        event.action === "inserted-parent" &&
        D.parents(event.newState, T.thing(event.newTree, event.childNode)).length > 1
      );
    },
  });

  goals.set("expand-item", {
    title: "Expand an item to see its children.",
    doesComplete(event) {
      return (
        event.action === "toggled-item" &&
        T.expanded(event.newTree, event.node) &&
        T.children(event.newTree, event.node).length >= 1
      );
    },
  });

  goals.set("remove-item", {title: "Remove an item from its parent.", doesComplete: notYetImplemented});
  goals.set("delete-item", {title: "Destroy an item you don't need.", doesComplete: notYetImplemented});
  goals.set("move-item", {title: "Move an item to somewhere else.", doesComplete: notYetImplemented});
  goals.set("insert-link", {title: "Insert a link inside an item.", doesComplete: notYetImplemented});
  goals.set("expand-link", {title: "Click on the link to expand it.", doesComplete: notYetImplemented});
  goals.set("jump-item", {title: "Jump to another item.", doesComplete: notYetImplemented});
  goals.set("jump-home", {title: "Go to the home view.", doesComplete: notYetImplemented});
  goals.set("find-item", {title: "Find an item and jump to it.", doesComplete: notYetImplemented});

  return goals;
})();

export const initialState: State = {finished: new Set()};

export function action(state: State, event: ActionEvent): State {
  const finished = new Set(state.finished);

  for (const id of goals.keys()) {
    if (!state.finished.has(id) && goals.get(id)!.doesComplete(event)) {
      finished.add(id);
    }
  }

  return {...state, finished};
}

function title(goal: GoalId): string {
  const title = goals.get(goal)?.title;
  if (title === undefined) throw "bad programmer";
  return title;
}

export function EmbeddedGoal(props: {id: GoalId; state: State}) {
  const finished = props.state.finished.has(props.id);
  return (
    <span className={classes({goal: true, "goal-finished": finished})}>
      <i className="fas fa-pen" />
      <span>{title(props.id)}</span>
    </span>
  );
}
