import * as D from "./data";

export async function getData(): Promise<D.Things> {
  // TODO: Error handling when converting to Things.
  return (await fetch("/api/things")).json() as Promise<D.Things>;
}

export async function putData(data: object): Promise<void> {
  await fetch("/api/things", {method: "put", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data)});
}

export async function getUsername(): Promise<string> {
  return (await fetch("/api/username")).json();
}

export async function setContent(thing: number, content: string): Promise<void> {
  await fetch(`/api/things/${thing}/content`, {method: "put", body: content});
}

export async function setPage(thing: number, page: string): Promise<void> {
  await fetch(`/api/things/${thing}/page`, {method: "put", body: page});
}

export async function removePage(thing: number): Promise<void> {
  await fetch(`/api/things/${thing}/page`, {method: "delete"});
}

export async function deleteThing(thing: number): Promise<void> {
  await fetch(`/api/things/${thing}`, {method: "delete"});
}

export async function putThing(thing: number, data: D.ThingData): Promise<void> {
  await fetch(`/api/things/${thing}`, {method: "put", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data)});
}

export async function putNext(next: number): Promise<void> {
  await fetch("/api/things/next", {method: "put", body: next.toString()});
}

export async function hasChanges(): Promise<boolean> {
  return (await fetch("/api/changes")).json();
}

export async function polledChanges(): Promise<void> {
  await fetch("/api/changes", {method: "post"});
}
