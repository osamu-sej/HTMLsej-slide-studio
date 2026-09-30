# HTML SEJ Slide Studio — 作業のきまり

AIで構成したスライドを、SEJの原本テンプレートの見た目で、動きのあるHTMLプレゼンとして編集・発表・書き出すWebアプリです。作るのはHTMLのスライドで、PowerPoint（.pptx）は作りません。HTML Slide Studio をベースに、SEJ Slide Studio のテンプレートを「SEJ」テーマ（既定）として再現しています。

## SEJテーマ

- マスター（ロゴ・緑線・秘（B）・社内限り・スローガン・コピーライト・ページ番号）は原本 `assets/sej/template.pptx` と同じ位置に描く（1インチ＝144px）。位置は `public/engine/engine.js` の `SEJ_MASTER`／`SEJ_BOX` にあり、`test/test_sej_master.py` が原本と1px以内で一致するかを確かめる。マスターを動かす・消す・書き換える変更はしない。
- ブランドのきまり：文字は黒（#1A1A1A）・濃紺（#1F3864）・グレー（#808080）だけ。白抜き文字は使わない。濃紺の面には文字を載せない。面は淡青・グレー・淡茶。影を付けない。色の付いた箱に枠線を付けない。アクセント色の変更は効かない。
- レイアウトやCSSを変えたら `npm run qa:sej`（撮影とSEJブランド検査）で見た目と指摘を確かめる。`test/sej.test.js` はSEJのスタイルに白い文字や落ち影が入っていないかも見る。

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
