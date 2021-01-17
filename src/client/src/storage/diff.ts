import * as Misc from "@johv/miscjs";
import {Communication} from "@thinktool/shared";

import {State, content, childConnections, connectionChild} from "../data";
import * as A from "../app";
import * as Tu from "../tutorial";

// When the user does something, we need to update both the local state and the
// state on the server. We can't just send over the entire state to the server
// each time; instead we use a REST API to make small changes.
//
// However, when we use library functions like Tree.moveToAbove (for example),
// we just get back the new state, not each of the steps needed to bring the old
// state to the new state. In this case, we have to go through and
// retrospectively calculate the changes that we need to send to the server.
//
// In theory, we would prefer to write our code such that we always know exactly
// what to send to the server. In practice, we use diffState quite frequently.

function diffState(
  oldState: State,
  newState: State,
): {added: string[]; deleted: string[]; changed: string[]; changedContent: string[]} {
  const added: string[] = [];
  const deleted: string[] = [];
  const changed: string[] = [];
  const changedContent: string[] = [];

  for (const thing in oldState.things) {
    if (oldState.things[thing] !== newState.things[thing]) {
      if (newState.things[thing] === undefined) {
        deleted.push(thing);
      } else if (JSON.stringify(oldState.things[thing]) !== JSON.stringify(newState.things[thing])) {
        if (
          // [TODO] Can we get better typechecking here?
          JSON.stringify(Misc.removeKey(oldState.things[thing] as any, "content")) ===
          JSON.stringify(Misc.removeKey(newState.things[thing] as any, "content"))
        ) {
          changedContent.push(thing);
        } else {
          changed.push(thing);
        }
      }
    } else {
      for (const connection of childConnections(oldState, thing)) {
        if (oldState.connections[connection.connectionId] !== newState.connections[connection.connectionId]) {
          changed.push(thing);
        }
      }
    }
  }

  for (const thing in newState.things) {
    if (oldState.things[thing] === undefined) {
      added.push(thing);
    }
  }

  return {added, deleted, changed, changedContent};
}

export type Effects = {
  deleted: string[];
  edited: {thing: string; content: Communication.Content}[];
  updated: {
    name: string;
    content: Communication.Content;
    children: {name: string; child: string}[];
    isPage: boolean; // [TODO] We don't use isPage anymore.
  }[];
  tutorialFinished: boolean | null;
};

export function effects(before: A.App, after: A.App): Effects {
  const diff = diffState(before.state, after.state);

  const deleted = diff.deleted;

  const edited = diff.changedContent.map((thing) => ({
    thing,
    content: content(after.state, thing),
  }));

  let updated = [...diff.added, ...diff.changed].map((thing) => ({
    name: thing,
    content: content(after.state, thing),
    children: childConnections(after.state, thing).map((c) => ({
      name: c.connectionId,
      child: connectionChild(after.state, c)!,
    })),
    isPage: false,
  }));

  return {
    deleted,
    edited,
    updated,
    tutorialFinished: (Tu.isActive(before.tutorialState) && !Tu.isActive(after.tutorialState)) || null,
  };
}