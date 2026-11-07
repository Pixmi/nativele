/**
 * Why lint cannot read what a custom element renders, as the contracts know it (see `childrenAt` in lint.ts).
 * The first three leave the tag without a contract, so its attributes and events are not checked either (unchecked-custom-elements); the next two leave a component without its template,
 * and an element of another library has a contract from its custom elements manifest, which does not say what the element renders.
 */
export type Unread =
  | { cause: "undefined" }
  | { cause: "not-component"; at: string }
  | { cause: "ambiguous"; packages: readonly string[] }
  | { cause: "template-unfollowed"; at: string }
  | { cause: "template-missing"; file: string }
  | { cause: "third-party"; pkg: string };

type Cause = Unread["cause"];

/** Each cause in the words unchecked-custom-elements and unchecked-content share: what it is, the fact a message adds after it, and the fix. */
export const UNREAD: { [C in Cause]: { what: string; detail: (u: Extract<Unread, { cause: C }>) => string; fix: string } } = {
  undefined: {
    what: "no define() in the scanned folders, and no custom elements manifest of the package or its dependencies",
    detail: () => "",
    fix: "add the folders that define the project's own components to the scanned folders (another library's elements are checked when their package declares a custom elements manifest, the customElements field of its package.json)",
  },
  "not-component": {
    what: "define() passes a class that lint cannot follow through relative imports to a class extending Component(...) in the scanned folders",
    detail: (u) => u.at,
    fix: "declare a class that extends Component(...) in the scanned folders, and import it by a relative path where define() is called",
  },
  ambiguous: {
    what: "defined in several packages, and not exactly once in the template's package",
    detail: (u) => u.packages.join(", "),
    fix: "keep one define() of a tag per package",
  },
  "template-unfollowed": {
    what: "the class passes Component() a template lint cannot follow to an .html file imported by a relative path",
    detail: (u) => u.at,
    fix: `pass Component() a template imported by a relative path, such as import tpl from "./x.html.js"`,
  },
  "template-missing": {
    what: "the template file the class imports does not exist",
    detail: (u) => u.file,
    fix: "restore the template file or correct the import path in the class",
  },
  "third-party": {
    what: "an element of a package whose custom elements manifest declares its attributes, events and slots but not what it renders",
    detail: (u) => u.pkg,
    fix: "check by hand that the element around it is operable or named",
  },
};

export const NOT_DEFINED: Unread = { cause: "undefined" };

export const noContract = (u: Unread): boolean => u.cause === "undefined" || u.cause === "not-component" || u.cause === "ambiguous";

export const detailOf = (u: Unread): string => (UNREAD[u.cause].detail as (u: Unread) => string)(u);

/** `what: detail`, or `what` for a cause without one. */
export const unreadWhy = (u: Unread): string => {
  const detail = detailOf(u);
  return detail ? `${UNREAD[u.cause].what}: ${detail}` : UNREAD[u.cause].what;
};

export const and = (xs: readonly string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? ""));

/** The fix of each cause among `tags` (tag to cause), as `for <a> and <b>, fix`, in the order of UNREAD. */
export function unreadFixes(tags: ReadonlyMap<string, Unread>): string[] {
  return (Object.keys(UNREAD) as Cause[]).flatMap((cause) => {
    const named = [...tags].filter(([, u]) => u.cause === cause).map(([tag]) => `<${tag}>`);
    return named.length ? [`for ${and(named)}, ${UNREAD[cause].fix}`] : [];
  });
}
