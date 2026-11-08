# Performance

Part of the [Nativele](../README.md) documentation.

`npm run bench` runs a large list benchmark in real Chrome and prints this table. Each item shows one text; the times are the median of 5 runs and count script execution only (no layout or paint). They were measured on one machine (Chrome on WSL), so read them as proportions, not absolute numbers. "Direct DOM" is a hand-written keyed list with plain DOM calls, the floor any library adds to.

| Approach | Items | Create | Update 10% | Reverse | Remove half | Append 1,000 |
|---|---|---|---|---|---|---|
| Components (`items =`) | 1,000 | 15.4 ms | 0.5 ms | 1.8 ms | 1.1 ms | 14.6 ms |
| Components (`items =`) | 5,000 | 80.5 ms | 1.6 ms | 10 ms | 5.4 ms | 17.6 ms |
| Components (`items =`) | 10,000 | 160.6 ms | 3.2 ms | 21 ms | 11.3 ms | 16 ms |
| Plain elements (`replace()`) | 1,000 | 2.8 ms | 0.1 ms | 0.7 ms | 0.2 ms | 2.9 ms |
| Plain elements (`replace()`) | 5,000 | 15.8 ms | 0.7 ms | 4.3 ms | 1.7 ms | 3.7 ms |
| Plain elements (`replace()`) | 10,000 | 42 ms | 1.4 ms | 8.6 ms | 3.3 ms | 4.4 ms |
| Direct DOM (baseline) | 1,000 | 0.8 ms | 0.2 ms | 1 ms | 0.3 ms | 0.8 ms |
| Direct DOM (baseline) | 5,000 | 4 ms | 0.8 ms | 4.3 ms | 1.6 ms | 1.1 ms |
| Direct DOM (baseline) | 10,000 | 8.7 ms | 1.7 ms | 10.9 ms | 3.9 ms | 1.6 ms |

- Creating component items costs about 15 µs per item, because each item is a custom element with its own template, refs and lifecycle; plain elements cost about 3–4 µs and direct DOM about 1 µs.
- Once the items exist, updating, reordering and removing them stay within about two times of direct DOM: only items that are a new object are touched, and kept elements are moved, not rebuilt.
- A frame has about 16 ms. A list of a few thousand component items is comfortable; for tens of thousands, use plain elements with `replace()`, show a page or a window of the list at a time, or keep component items for the rows that need state and events.
- Event delegation adds no listeners as the list grows.
