import * as React from "react";
import * as ReactDOM from "react-dom";
import {choose} from "@johv/miscjs";

import type {Result} from "../search";

import {App, merge} from "../app";

import * as D from "../data";
import Search from "../search";

function useFocusInputRef(): React.RefObject<HTMLInputElement> {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return inputRef;
}

function ResultListItem(props: {result: Result; selected: boolean; onSelect: () => void}) {
  // Using onPointerDown instead of onClick to circumvent parent getting blur
  // event before we get our events.
  return (
    <li
      onPointerDown={props.onSelect}
      className={`link-autocomplete-popup-result${props.selected ? " selected-result" : ""}`}
    >
      <span className="link-autocomplete-popup-result-content">
        {props.result.content} <span className="link-autocomplete-popup-id">{props.result.thing}</span>
      </span>
    </li>
  );
}

function useSearch(args: {query: string; onSearch(query: string, maxResults: number): void}) {
  const [maxResults, setMaxResults] = React.useState(50);

  function loadMoreResults() {
    const newMaxResults = maxResults + 50;
    args.onSearch(args.query, newMaxResults);
    setMaxResults(newMaxResults);
  }

  function setQuery(newQuery: string) {
    setMaxResults(50);
    args.onSearch(newQuery, 50);
  }

  return {setQuery, loadMoreResults};
}

function useSelection(results: number) {
  const [index, setIndex] = React.useState<number>(0);

  function selectPrevious() {
    setIndex((i) => Math.min(results, i + 1));
  }

  function selectNext() {
    setIndex((i) => Math.max(-1, i - 1));
  }

  function isCreateItem() {
    return index === -1;
  }

  return {index, selectPrevious, selectNext, isCreateItem};
}

function Popup(props: {
  query: string;
  onSearch(query: string, maxResults: number): void;
  results: Result[];
  onCreate(): void;
  onSelect(thing: string): void;
  onAbort(): void;
}) {
  // This element should always be focused when it exists. We expect the parent
  // to remove us from the DOM when we're not needed.
  const inputRef = useFocusInputRef();

  const search = useSearch({query: props.query, onSearch: props.onSearch});
  function onScroll(ev: React.UIEvent) {
    const el = ev.target as HTMLUListElement;
    if (el.scrollTop + el.clientHeight + 500 > el.scrollHeight) {
      search.loadMoreResults();
    }
  }

  const selection = useSelection(props.results.length);

  function onKeyDown(ev: React.KeyboardEvent<HTMLInputElement>): void {
    const {found} = choose(ev.key, {
      Enter() {
        if (selection.isCreateItem()) {
          props.onCreate();
        } else {
          props.onSelect(props.results[selection.index].thing);
        }
      },
      Escape: props.onAbort,
      ArrowDown: selection.selectPrevious,
      ArrowUp: selection.selectNext,
    });
    if (found) ev.preventDefault();
  }

  return ReactDOM.createPortal(
    <div className="link-autocomplete-popup">
      <input
        onPointerDown={() => props.onCreate()}
        className={selection.isCreateItem() ? " selected-result" : ""}
        ref={inputRef}
        type="text"
        value={props.query}
        onChange={(ev: React.ChangeEvent<HTMLInputElement>) => {
          search.setQuery(ev.target.value);
        }}
        onBlur={() => props.onAbort()}
        onKeyDown={onKeyDown}
      />
      <span className="create-label">Create new item</span>
      {props.query !== "" && (
        <ul className="link-autocomplete-popup-results" onScroll={onScroll}>
          {props.results.map((result, i) => (
            <ResultListItem
              key={result.thing}
              selected={i === selection.index}
              result={result}
              onSelect={() => props.onSelect(result.thing)}
            />
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

export function usePopup(app: App) {
  const [isPopupVisible, setIsPopupVisible] = React.useState(false);

  const appRef = React.useRef(app);
  React.useEffect(() => {
    appRef.current = app;
  }, [app]);

  const [onCreate, setOnCreate] = React.useState(() => (content: string) => {
    console.error("onCreate callback not set!");
  });

  const [onSelect, setOnSelect] = React.useState(() => (selection: string) => {
    console.error("onSelect callback not set!");
  });

  function input(seedText?: string): Promise<[App, string]> {
    return new Promise((resolve, reject) => {
      setQuery(seedText ?? "");
      setOnCreate(() => (content: string) => {
        let [state, selection] = D.create(appRef.current!.state);
        state = D.setContent(state, selection, [content]);
        resolve([merge(appRef.current!, {state}), selection]);
      });
      setOnSelect(() => (selection: string) => {
        resolve([appRef.current!, selection]);
      });
      setIsPopupVisible(true);
    });
  }

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{thing: string; content: string}[]>([]);
  const search = React.useMemo<Search>(() => new Search(app.state), [app.state]);

  function onSearch(query: string, maxResults: number) {
    setQuery(query);
    if (query === "") {
      setResults([]);
    } else {
      // [TODO] This is slow for long text. Consider adding a debounce for long
      // text as a workaround.
      const results = search.query(query, maxResults);
      setResults(results);
    }
  }

  React.useEffect(() => {
    if (!isPopupVisible) {
      onSearch("", 50);
    }
  }, [isPopupVisible]);

  const component = (() => {
    if (!isPopupVisible) return null;

    return (
      <Popup
        query={query}
        onAbort={() => setTimeout(() => setIsPopupVisible(false))} // [TODO] I don't remember why we setTimeout. Do we need it?
        onSelect={(thing) => {
          onSelect(thing);
          setIsPopupVisible(false);
        }}
        onCreate={() => {
          onCreate(query);
          setIsPopupVisible(false);
        }}
        results={results}
        onSearch={onSearch}
      />
    );
  })();

  return {component, input};
}
