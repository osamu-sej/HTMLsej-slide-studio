# HTML SEJ Slide Studio — 作業のきまり

AIで構成したスライドを、SEJの原本テンプレートの見た目で、動きのあるHTMLプレゼンとして編集・発表・書き出すWebアプリです。作るのはHTMLのスライドで、PowerPoint（.pptx）は作りません。HTML Slide Studio をベースに、SEJ Slide Studio のテンプレートを「SEJ」テーマ（既定）として再現しています。

## SEJテーマ

- マスター（ロゴ・緑線・秘（B）・社内限り・スローガン・コピーライト・ページ番号）は原本 `assets/sej/template.pptx` と同じ位置に描く（1インチ＝144px）。位置は `public/engine/engine.js` の `SEJ_MASTER`／`SEJ_BOX` にあり、`test/test_sej_master.py` が原本と1px以内で一致するかを確かめる。マスターを動かす・消す・書き換える変更はしない。
- スタジオで新しく作る資料のテーマはSEJ固定。テーマ・アクセント色を選ぶ画面は置かず、AI（生成・会話）のスキーマとプロンプトにもテーマを入れない。別のテーマの資料は `withTemplate()`（public/app.js）で開くときにSEJへ戻す。PowerPointを見た目どおりに取り込んだページは `master: source` により元のマスターを表示する。ほかの8テーマはエンジンと撮影テスト（`npm run qa`）のためだけに残す。
- ブランドのきまり：文字は黒（#1A1A1A）・濃紺（#1F3864）・グレー（#808080）だけ。白抜き文字は使わない。濃紺の面には文字を載せない。面は淡青・グレー・淡茶。影を付けない。色の付いた箱に枠線を付けない。アクセント色の変更は効かない。
- レイアウトやCSSを変えたら `npm run qa:sej`（撮影とSEJブランド検査）で見た目と指摘を確かめる。`test/sej.test.js` はSEJのスタイルに白い文字や落ち影が入っていないかも見る。

## 編集画面（PowerPointと同じ配置）

- 上からリボン（全幅）・メッセージバー（1行）・［サムネイル｜スライドとノート｜作業ウィンドウ］・ステータス バー。配置と境目・開閉・ノート・ステータス バーとズームは `public/editor/window.mjs`、リボンの表示オプション（常に表示・タブのみ・自動的に非表示、⌘F1）は `public/editor/ui.mjs`。スライドはウィンドウに合わせて全体が見えること（ズームの100%は1280px）。リボンやメッセージを増やすときもスライドを押し出さない。ルーラーは `public/editor/rulers.mjs`、資料のガイド（`deck.guides`）は canvas.mjs（吸着はSEJのガイドと合わせて `allGuides()`）。変えたら `qa/studio-layout.mjs` を通す。
- セクション（`slide.section`＝そのスライドから始まるセクション名）・コメント（`slide.comments`、`public/editor/comments.mjs`。書いた人 `by`・`uid`、返信 `replies`、ピン留め `anchor`。名前は `public/editor/people.mjs`）・非表示（`hidden`）はユーザーだけの項目（`USER_ONLY_FIELDS`）。AIの変更のあとも `restoreUserFields`（server/chat.mjs）で残す。リハーサルは `slide.advance` に入れる。開発タブの「スライドのJSON」は `normalizeSlide` を通してから反映する。変えたら `qa/studio-powerpoint.mjs` を通す。
- 動きのIDE：アニメーション ウィンドウ（`public/editor/anim.mjs`）はスライドで動くものを起きる順に並べる（スライドの自動の動き＝`autoMotionInfo()`（app.js）・アニメーション・インタラクション）。どれもその場で変えられ、1回のUndoで戻る。見た目どおりの取り込みにはHTMLの動き（おまかせ）を自動で付け（設定 `hsej-auto-html`、既定はオン）、メッセージバーから元に戻せる。取り込みの忠実度を見るQA（`studio-import.mjs`）は自動をオフにして走らせ、自動の流れは `qa/studio-motion-ide.mjs` で確かめる。

## 自由配置（PowerPoint風の編集）

- 手で置く部品（図形・テキストボックス・画像・線・アイコン・動画）は `slide.elements`。描画は `public/engine/objects.js`（発表・書き出しも同じ）、編集は `public/editor/`（canvas＝マウスとキー、ops＝計算、ui＝リボンと書式パネル）。
- `elements`・`timeline`・`sid` はユーザーだけの項目。AIの出力スキーマに入れず、プロンプトには要約（`server/objects.mjs`）だけを渡し、AIの変更のあとは必ず元に戻す（`server/schemas.mjs` の `USER_ONLY_FIELDS`）。AIは白紙（`blank`）のスライドを作らない。
- 部品はSEJマスターの下に描く（`.hs-objects` は z-index 4、`.hs-sej` は 5）。色の一覧（`PALETTE`）はSEJの色だけにし、ほかの色はブランド検査で知らせる。
- 部品の文字は決まったタグだけのHTML（`sanitizeRich`）。画面に出す前に必ず通す。
- 表・グラフは部品の `table`・`chart`（編集は `public/editor/tables.mjs`）、トリミングは `crop.mjs`、手で描く形と頂点の編集は `freeform.mjs`（`shape: "custom"` と `path`）。
- 「図形に変換」（`public/editor/convert.mjs`）は、レイアウトのスライドを画面外で原寸に描いて読み取り、部品にして白紙のスライドにする。項目は `group`、出し方は `timeline`、詳細・深掘りは部品の `item` に引き継ぐ。色は `PALETTE` に合わせる（淡い色は元の色＋透明度）。レイアウトを変えたら `qa/studio-convert.mjs` を通し、見た目が原本と変わらないことを確かめる。
- PowerPointの「見た目どおりに取り込む」は `tools/pptx_exact.py`（`/api/import?mode=exact`）。1枚ずつ白紙（`hideTitle`・`master: source`）の部品にし、グラフは書式を `chart.style` に入れて `officeChart`（objects.js）で描く。取り込み資料は元のマスター・装飾・画像を保持し、スタジオのSEJマスターとブランド検査を重ねない。非表示スライドも編集データに残し、発表からは除く。変えたら `test/test_pptx_exact.py`・`test/import-exact.test.js`・`qa/studio-import.mjs` を通し、LibreOfficeで描いた原本と並べて見比べる。
- 図形の結合は `public/editor/merge.mjs`（図形の輪郭を `E.geometry` から多角形にし、`/vendor/polygon-clipping.js`（node_modules の polygon-clipping）で計算）。結果は `shape: "custom"` で、`path.parts` に2つ目以降の輪（穴・離れた部分。even-odd で描く）。SmartArt は部品の `smartart`（`{ layout, items: [{ text, level }], color, style, fsScale, rtl }`）。レイアウトは objects.js の `smartartParts`（SEJの淡い色・黒い文字だけ）、図形に変換は `smartartObjects`、編集は `public/editor/smartart.mjs`。アニメーションの `by: "item"` で項目が1つずつ現れる。変えたら `test/merge.test.js`・`test/smartart.test.js`・`qa/studio-graphics.mjs` と `node qa/shoot.mjs --themes=sej --deck=/qa/smartart.json --per=8` を通す。
- オーディオは部品の `audio`（挿入 → オーディオ・録音、画面録画はビデオ）。再生の設定（`trimStart`・`trimEnd`・`fadeIn`・`fadeOut`・`volume`・`rewind`・`across`・`hideIcon`、ビデオは `fullscreen`・`hideIdle`）は objects.js の `normalizePlayback`、再生は `mediaPlay`（objects.js）、スライドをまたぐ再生は motion.js の `carrySounds`。編集は `public/editor/media.mjs`（再生タブ）。変えたら `test/media.test.js` と `qa/studio-media.mjs` を通す。
- HTMLならではの動きは部品の `hover`・`tip`・`loop` と `action`（`popup`・`zoom`・`spot`・`flip`・`reveal`）。描くのは objects.js（発表中だけ `data-*` を付ける。編集画面では動かない）、動かすのは motion.js（プレーヤー）と engine.css、編集はリボン「インタラクション」（`public/editor/interact.mjs`）。HTMLの効果は animate.js の `html: true`（戻せないものは `noExit`）。おまかせ（`public/editor/htmlfx.mjs`）は元のアニメーション・動作を消さず、テンプレートの飾り（`chromeOf`）と非表示のスライドに付けない。変えたら `test/interact.test.js` と `qa/studio-interact.mjs` を通す。
- アニメーションは `slide.timeline`（再生は `public/engine/animate.js`、編集は `public/editor/anim.mjs`）。開始・終了は `transform`／`opacity`／`clip-path`、強調は `scale`／`rotate`（足し合わせ）と色、軌跡は `translate`（足し合わせ）で動かし、同じ部品の効果が打ち消し合わないようにする。発表のクリックはレイアウトの「中身の出し方」の後にアニメーションが続く（`data-lsteps`・`data-steps`）。
- 全ページの動き・クリック動作のリセットは `public/reset-actions.mjs`。元の文字・図形・画像とスライドを残し、タイムライン、レイアウトの出し方、モーショングラフィック、画面切り替え、メディアの自動再生、図形のクリックリンク、詳細・深掘りのクリック設定、HTML独自のホバー・説明・連続モーションを消す。アプリ側は1回だけUndoを積む。AIとの通常会話は`timeline`を書けないため、現段階の「AIにHTML演出を相談」は提案文を作るだけで自動反映しない。

## PRとマージ

- 変更はブランチで作り、PRを出す。**CI（test）が通ったら、確認を待たずにマージする**（下書きを解除してから squash マージ）。ユーザーに「マージしますか」と聞かない。
- CIが落ちたら直してから。競合したら main を取り込んで直す。
- マージ後は作業ブランチを最新の main にそろえる。

## 版と更新履歴

- 機能追加・不具合修正を入れたら `package.json` の version を上げ（`npm version 1.2.0 --no-git-tag-version`）、README の「更新履歴」に1行書く。画面左上の版表示で、ユーザーが最新版かどうかを見分けるため。

## 確認

- `npm test`（CodexとOllamaは偽物で代用）。
- 画面にかかわる変更は、`npm start` のあと `qa/studio-smoke.mjs`・`studio-editing.mjs`・`studio-ai-mock.mjs`・`studio-motion.mjs`・`studio-drill.mjs`・`studio-interactive.mjs`・`studio-objects.mjs`・`studio-animations.mjs`・`studio-tables.mjs`・`studio-convert.mjs`・`studio-import.mjs`・`studio-interact.mjs`・`studio-layout.mjs`・`studio-motion-ide.mjs`・`studio-powerpoint.mjs`・`studio-media.mjs`・`studio-graphics.mjs` を実際のブラウザで通す。リボンは狭い幅だとグループを1つのボタンに折りたたむので、QAでボタンを探すときは折りたたんだグループも開く。
- 深掘りページ（`drillOf`）は元のスライドの直後に置く本編外のページ。本編の並び・番号は `E.storyMap`（engine.js）とサーバーの `drillParents`（server/chat.mjs）が同じ決まりで求める。
- レイアウトの「見た目のグループ」と単調さのチェックは `public/layout-looks.mjs` にあり、サーバー（AIへの指示・自動の選び直し）とスタジオ（チェック・骨子の画面）が同じものを使う。
