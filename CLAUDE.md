# ts-dom — Claude Instructions

## 定位

給想用 TypeScript 加 HTML 做輕量開發的人。HTML 描述結構與資料落點，TypeScript 擁有行為與狀態，DOM 是畫面的唯一事實來源。庫會公開給各種專案使用，不為任何單一專案調整設計。

## 核心精神

判斷新功能或改動該不該做的依據：

- HTML 只有名稱，沒有表達式：`{{ name }}` 只能是單一識別字，不支援路徑與運算，需要計算就在 TypeScript 做完再填入具名的洞。不往樣板語言的方向發展。
- 型別由 codegen 從 HTML 推出，`tsc` 與 lint 檢查 HTML 和 TS 是否對得上，這是庫最核心的價值。
- 沒有虛擬 DOM，更新是明確、局部的 DOM 操作，不做整棵樹的 diff。
- 生命週期沿用 Custom Elements，不另造一套。
- 資料單向流動：state 由自己改，props 由父元件改，事件往上送；`emit` 預設不冒泡，跨層用明確處理或共用 store，不做隱式跨層傳遞。
- 渲染同步、無隱式非同步批次；要合併更新用明確的 `batch`。
- 不做細粒度響應式系統，換取可預期、沒有依賴追蹤的魔法。
- `state` 是選用功能；共用資料走 `createStore`，訂閱只發生在呼叫 `bind` 的地方。
- 不管理圖示、不內建 i18n、不帶 UI 元件，這些由使用者以自己的元件或 `this.text` 處理，庫只提供能接上的介面。
- 沒有 bundler 時只靠 `ts-dom gen` 加 `tsc` 也要能用；匯入範本一律寫 `./x.html.js`，有無 Vite 都通。Vite 外掛只是方便，不是必要條件。
- 頁面啟用 Trusted Types 時要能直接運作：執行期不解析 HTML 字串，範本由產生的節點資料用 DOM 呼叫建立；任何新功能都不得使用 `innerHTML` 之類的解析 API。
- 依賴越少越好，執行期零依賴；`parse5` 只用於 codegen 與 lint。

「設計決定」一節（README 的 Design Decisions）列的是刻意的取捨，不是缺少的功能，不要當成待補項目去實作。

## 語言

- 對外文件一律使用英語：`README.md`、`CHANGELOG.md`、`llms.txt`、程式碼註解、錯誤與診斷訊息、PR 描述。
- 只有 `README.zh-TW.md` 是繁體中文，內容要與 `README.md` 同步；改了其一就改另一份。
- 本檔與其他給開發者與 Claude 的說明用繁體中文。

## 開發規範

- 提交前跑 `npm run check`、`npm test`、`npm run lint`；動到執行期行為時再跑 `npm run test:browser`。
- 預設不寫註解，只寫程式本身看不出的原因（外部限制、不能改動的順序），不重述程式在做什麼。
- 診斷訊息格式為 `file:line:col severity [rule-id] message`，結尾附 `Fix:` 提示，新增的規則要照做。
- 新增規則或公開 API 要同步更新 `README.md`、`README.zh-TW.md`、`llms.txt` 與 `CHANGELOG.md`。
- 公開 API 的破壞性變更要寫進 `CHANGELOG.md` 的對應版本，版本規則見該檔的 Versioning policy。
- 產生的 `*.html.ts` 與 `ts-dom-tags.ts` 不提交。
