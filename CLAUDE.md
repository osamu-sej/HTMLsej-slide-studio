# HTML SEJ Slide Studio — 作業のきまり

AIで構成したスライドを、SEJの原本テンプレートの見た目で、動きのあるHTMLプレゼンとして編集・発表・書き出すWebアプリです。作るのはHTMLのスライドで、PowerPoint（.pptx）は作りません。HTML Slide Studio をベースに、SEJ Slide Studio のテンプレートを「SEJ」テーマ（既定）として再現しています。

## SEJテーマ

- マスター（ロゴ・緑線・秘（B）・社内限り・スローガン・コピーライト・ページ番号）は原本 `assets/sej/template.pptx` と同じ位置に描く（1インチ＝144px）。位置は `public/engine/engine.js` の `SEJ_MASTER`／`SEJ_BOX` にあり、`test/test_sej_master.py` が原本と1px以内で一致するかを確かめる。マスターを動かす・消す・書き換える変更はしない。
- スタジオの資料はいつもSEJテンプレート。テーマ・アクセント色を選ぶ画面は置かず、AI（生成・会話）のスキーマとプロンプトにもテーマを入れない。別のテーマの資料は `withTemplate()`（public/app.js）で開くときにSEJへ戻す。ほかの8テーマはエンジンと撮影テスト（`npm run qa`）のためだけに残す。
- ブランドのきまり：文字は黒（#1A1A1A）・濃紺（#1F3864）・グレー（#808080）だけ。白抜き文字は使わない。濃紺の面には文字を載せない。面は淡青・グレー・淡茶。影を付けない。色の付いた箱に枠線を付けない。アクセント色の変更は効かない。
- レイアウトやCSSを変えたら `npm run qa:sej`（撮影とSEJブランド検査）で見た目と指摘を確かめる。`test/sej.test.js` はSEJのスタイルに白い文字や落ち影が入っていないかも見る。

## 自由配置（PowerPoint風の編集）

- 手で置く部品（図形・テキストボックス・画像・線・アイコン・動画）は `slide.elements`。描画は `public/engine/objects.js`（発表・書き出しも同じ）、編集は `public/editor/`（canvas＝マウスとキー、ops＝計算、ui＝リボンと書式パネル）。
- `elements`・`timeline`・`sid` はユーザーだけの項目。AIの出力スキーマに入れず、プロンプトには要約（`server/objects.mjs`）だけを渡し、AIの変更のあとは必ず元に戻す（`server/schemas.mjs` の `USER_ONLY_FIELDS`）。AIは白紙（`blank`）のスライドを作らない。
- 部品はSEJマスターの下に描く（`.hs-objects` は z-index 4、`.hs-sej` は 5）。色の一覧（`PALETTE`）はSEJの色だけにし、ほかの色はブランド検査で知らせる。
- 部品の文字は決まったタグだけのHTML（`sanitizeRich`）。画面に出す前に必ず通す。
- 表・グラフは部品の `table`・`chart`（編集は `public/editor/tables.mjs`）、トリミングは `crop.mjs`、手で描く形と頂点の編集は `freeform.mjs`（`shape: "custom"` と `path`）。
- 「図形に変換」（`public/editor/convert.mjs`）は、レイアウトのスライドを画面外で原寸に描いて読み取り、部品にして白紙のスライドにする。項目は `group`、出し方は `timeline`、詳細・深掘りは部品の `item` に引き継ぐ。色は `PALETTE` に合わせる（淡い色は元の色＋透明度）。レイアウトを変えたら `qa/studio-convert.mjs` を通し、見た目が原本と変わらないことを確かめる。
- アニメーションは `slide.timeline`（再生は `public/engine/animate.js`、編集は `public/editor/anim.mjs`）。開始・終了は `transform`／`opacity`／`clip-path`、強調は `scale`／`rotate`（足し合わせ）と色、軌跡は `translate`（足し合わせ）で動かし、同じ部品の効果が打ち消し合わないようにする。発表のクリックはレイアウトの「中身の出し方」の後にアニメーションが続く（`data-lsteps`・`data-steps`）。

## PRとマージ

- 変更はブランチで作り、PRを出す。**CI（test）が通ったら、確認を待たずにマージする**（下書きを解除してから squash マージ）。ユーザーに「マージしますか」と聞かない。
- CIが落ちたら直してから。競合したら main を取り込んで直す。
- マージ後は作業ブランチを最新の main にそろえる。

## 版と更新履歴

- 機能追加・不具合修正を入れたら `package.json` の version を上げ（`npm version 1.2.0 --no-git-tag-version`）、README の「更新履歴」に1行書く。画面左上の版表示で、ユーザーが最新版かどうかを見分けるため。

## 確認

- `npm test`（CodexとOllamaは偽物で代用）。
- 画面にかかわる変更は、`npm start` のあと `qa/studio-smoke.mjs`・`studio-editing.mjs`・`studio-ai-mock.mjs`・`studio-motion.mjs`・`studio-drill.mjs`・`studio-interactive.mjs`・`studio-objects.mjs`・`studio-animations.mjs`・`studio-tables.mjs`・`studio-convert.mjs` を実際のブラウザで通す。リボンは狭い幅だとグループを1つのボタンに折りたたむので、QAでボタンを探すときは折りたたんだグループも開く。
- 深掘りページ（`drillOf`）は元のスライドの直後に置く本編外のページ。本編の並び・番号は `E.storyMap`（engine.js）とサーバーの `drillParents`（server/chat.mjs）が同じ決まりで求める。
- レイアウトの「見た目のグループ」と単調さのチェックは `public/layout-looks.mjs` にあり、サーバー（AIへの指示・自動の選び直し）とスタジオ（チェック・骨子の画面）が同じものを使う。
