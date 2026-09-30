# HTML Slide Studio — 作業のきまり

AIで構成したスライドを、動きのあるHTMLプレゼンとして編集・発表・書き出すWebアプリです。作るのはHTMLのスライドで、PowerPoint（.pptx）は作りません。

## PRとマージ

- 変更はブランチで作り、PRを出す。**CI（test）が通ったら、確認を待たずにマージする**（下書きを解除してから squash マージ）。ユーザーに「マージしますか」と聞かない。
- CIが落ちたら直してから。競合したら main を取り込んで直す。
- マージ後は作業ブランチを最新の main にそろえる。

## 版と更新履歴

- 機能追加・不具合修正を入れたら `package.json` の version を上げ（`npm version 1.2.0 --no-git-tag-version`）、README の「更新履歴」に1行書く。画面左上の版表示で、ユーザーが最新版かどうかを見分けるため。

## 確認

- `npm test`（CodexとOllamaは偽物で代用）。
- 画面にかかわる変更は、`npm start` のあと `qa/studio-smoke.mjs`・`studio-editing.mjs`・`studio-ai-mock.mjs`・`studio-motion.mjs`・`studio-drill.mjs`・`studio-interactive.mjs` を実際のブラウザで通す。
- 深掘りページ（`drillOf`）は元のスライドの直後に置く本編外のページ。本編の並び・番号は `E.storyMap`（engine.js）とサーバーの `drillParents`（server/chat.mjs）が同じ決まりで求める。
- レイアウトの「見た目のグループ」と単調さのチェックは `public/layout-looks.mjs` にあり、サーバー（AIへの指示・自動の選び直し）とスタジオ（チェック・骨子の画面）が同じものを使う。
