/** Names that would override built-in DOM members or ts-dom's own members. Shared by the runtime and codegen (must not depend on Node or the DOM). */
export const RESERVED_NAMES = new Set(
  `remove click focus blur append prepend before after replaceWith replaceChildren scroll scrollTo scrollBy scrollIntoView animate attachShadow closest matches contains normalize cloneNode dispatchEvent addEventListener removeEventListener getAttribute setAttribute hasAttribute removeAttribute toggleAttribute querySelector querySelectorAll insertBefore appendChild removeChild replaceChild requestFullscreen showPopover hidePopover togglePopover checkVisibility getBoundingClientRect attachInternals constructor
   refs lists text root state props set batch render show bind on emit onCleanup connected disconnected slotchange assignedNodes connectedCallback disconnectedCallback attributeChangedCallback`.split(/\s+/),
);

export const attrNameOf = (prop: string): string => prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
