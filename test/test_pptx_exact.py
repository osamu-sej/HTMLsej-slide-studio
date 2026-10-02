"""Source pages retain their own masters, objects, text, charts, effects, and hidden slides."""
import io
import sys
import unittest
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.util import Inches

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
sys.path.insert(0, str(HERE))

import pptx_exact  # noqa: E402
import pptx_fixtures  # noqa: E402
from pptx_exact import read_pptx_exact  # noqa: E402

IN = 144  # slide pixels per inch


def by_text(slide, words):
    return next(o for o in slide["elements"] if words in o.get("text", ""))


class SejDeckTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.deck = read_pptx_exact(pptx_fixtures.sej_deck())
        cls.slides = cls.deck["slideData"]

    def test_an_sej_deck_keeps_every_slide_including_hidden_ones(self):
        self.assertTrue(self.deck["sej"])
        self.assertEqual(self.deck["fidelity"], "exact")
        self.assertEqual(self.deck["deckTitle"], "発注業務の改革")
        self.assertEqual(len(self.slides), 4)
        self.assertEqual(self.deck["stats"]["hidden"], 1)
        self.assertIn("隠したページ", str(self.slides[2]))
        self.assertTrue(self.slides[2]["hidden"])
        for slide in self.slides:
            self.assertEqual(slide["type"], "blank")
            self.assertTrue(slide["hideTitle"], "the slide's own title box shows the title")
        self.assertEqual([s["master"] for s in self.slides], ["source"] * 4)

    def test_the_original_master_marks_are_editable_objects(self):
        words = " ".join(o.get("text", "") for s in self.slides for o in s["elements"])
        for mark in ("社内限り", "明日の笑顔", "秘"):
            self.assertIn(mark, words)
        self.assertGreater(self.deck["stats"]["pictures"], 0, "the original logo is copied")

    def test_placeholders_take_their_place_from_the_layout(self):
        title = by_text(self.slides[1], "改革の全体像")
        self.assertLess(title["y"], 130)
        self.assertLess(title["x"], 120)
        self.assertTrue(title.get("bold"))
        body = by_text(self.slides[3], "最初の点")
        self.assertIn('data-indent="1"', body["text"], "the second level is indented")

    def test_shapes_keep_their_place_fill_and_text_runs(self):
        box = by_text(self.slides[1], "現状の課題")
        self.assertEqual((box["kind"], box["shape"], box["fill"], box["stroke"]), ("shape", "roundRect", "#dce4f2", "none"))
        for key, inches in (("x", 0.6), ("y", 1.6), ("w", 3.6), ("h", 1.6)):
            self.assertAlmostEqual(box[key], inches * IN, delta=1, msg=key)
        self.assertEqual(box["color"], "#1f3864")
        self.assertTrue(box["bold"])
        self.assertIn("font-size: 40.0px", box["text"], "20pt is 40px")
        self.assertIn("color: #1a1a1a; font-weight: 400", box["text"], "the second run is black and regular")
        oval = by_text(self.slides[1], "30分")
        self.assertEqual((oval["shape"], oval["fill"], oval["fs"]), ("ellipse", "#f5f0ea", 56.0))

    def test_bullets_and_links(self):
        text = by_text(self.slides[1], "端末で発注する")["text"]
        self.assertEqual(text.count('data-bullet="■"'), 3)
        self.assertIn('<a href="https://example.com/portal">', text)

    def test_tables_cell_by_cell(self):
        table = next(o for o in self.slides[1]["elements"] if o["kind"] == "table")
        self.assertEqual(len(table["cells"]), 3)
        self.assertEqual([c["text"] for c in table["cells"][0]], ["<p>項目</p>", "<p>現状</p>", "<p>目標</p>"])
        self.assertEqual(table["cells"][2][2]["text"], "<p>2.5%</p>")
        self.assertTrue(table["cells"][0][0].get("fill"), "the header row is filled from the table style")
        self.assertAlmostEqual(sum(table["cols"]), 1, places=3)

    def test_charts_keep_their_data_and_formatting(self):
        chart = next(o for o in self.slides[1]["elements"] if o["kind"] == "chart")["chart"]
        self.assertEqual(chart["type"], "bar")
        self.assertEqual(chart["labels"], ["A店", "B店", "C店"])
        self.assertEqual(chart["series"][0]["values"], [42.0, 30.0, 18.0])
        st = chart["style"]
        self.assertEqual((st["dir"], st["gap"]), ("bar", 60.0))
        self.assertEqual(st["series"][0]["color"], "#b7c3da")
        self.assertEqual(st["series"][0]["points"], [{"i": 0, "color": "#1f3864"}])
        self.assertEqual(st["series"][0]["label"]["format"], '0"h"')
        self.assertEqual(st["series"][0]["label"]["pos"], "outEnd")
        self.assertTrue(st["val"]["hide"])
        self.assertEqual(st["font"]["size"], 28.0, "14pt")

    def test_lines_groups_and_notes(self):
        slide = self.slides[1]
        line = next(o for o in slide["elements"] if o["kind"] == "line")
        self.assertEqual((line["stroke"], line["strokeW"], line["tail"]), ("#1f3864", 4.0, "triangle"))
        groups = {o.get("group") for o in slide["elements"] if "グループ" in o.get("text", "")}
        self.assertEqual(len(groups), 1)
        self.assertIsNotNone(groups.pop())
        self.assertEqual(slide["notes"], "ここで全体像を説明します。")

    def test_buttons_keep_where_they_go_in_a_slide_show(self):
        self.assertEqual([s["sid"] for s in self.slides], ["p1", "p2", "p3", "p4"], "ids for every slide")
        back = by_text(self.slides[3], "全体像へ戻る")
        self.assertEqual(back["action"], {"type": "slide", "to": "p2"})
        self.assertEqual(by_text(self.slides[3], "終わる")["action"], {"type": "end"})

    def test_animations_and_the_transition(self):
        slide = self.slides[1]
        self.assertEqual(slide["transition"], "fade")
        first, second = slide["timeline"]
        self.assertEqual((first["el"], first["cls"], first["fx"], first["start"]), (by_text(slide, "現状の課題")["id"], "in", "fade", "click"))
        self.assertEqual((second["el"], second["fx"], second["dir"], second["start"]), (by_text(slide, "30分")["id"], "flyIn", "left", "after"))
        self.assertEqual(first["dur"], 500)


class PlainDeckTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.deck = read_pptx_exact(pptx_fixtures.plain_deck())
        cls.slides = cls.deck["slideData"]

    def test_a_4_3_deck_is_centred_on_the_wide_page(self):
        self.assertFalse(self.deck["sej"])
        box = by_text(self.slides[1], "現状の課題")
        self.assertAlmostEqual(box["x"], (1920 - 1440) / 2 + 0.6 * IN, delta=1)
        self.assertAlmostEqual(box["w"], 3.6 * IN, delta=1)

    def test_backgrounds_pictures_and_rotation(self):
        cover = self.slides[0]["elements"]
        self.assertEqual(cover[0]["fill"], "#f1f5fb", "the slide's background comes first")
        shapes = self.slides[2]["elements"]
        self.assertTrue(any(o["kind"] == "image" and o["src"].startswith("data:image/") for o in shapes))
        chevron = next(o for o in shapes if o.get("shape") == "chevron")
        self.assertEqual(chevron["rot"], 20)
        self.assertTrue(any(o.get("shape") == "star5" for o in shapes))

    def test_objects_off_the_slide_are_kept_for_editing(self):
        # The fixture puts a picture beyond the 4:3 page; the HTML viewport clips it.
        pictures = [o for o in self.slides[1]["elements"] if o["kind"] == "image"]
        self.assertEqual(len(pictures), 1)
        self.assertGreater(pictures[0]["x"], self.slides[1]["sourceViewport"]["x"] + self.slides[1]["sourceViewport"]["w"])

    def test_a_pie_chart_is_a_donut_without_a_hole_showing_percentages(self):
        chart = next(o for o in self.slides[2]["elements"] if o["kind"] == "chart")["chart"]
        self.assertEqual(chart["type"], "donut")
        self.assertEqual(chart["style"]["hole"], 0)
        self.assertTrue(chart["style"]["series"][0]["label"]["pct"])
        self.assertEqual(len(chart["style"]["series"][0]["points"]), 3, "each slice its own colour")


class ChartNumberTest(unittest.TestCase):
    def test_category_numbers_and_dates_as_the_chart_shows_them(self):
        self.assertEqual(pptx_exact.number_text(2024, "General"), "2024")
        self.assertEqual(pptx_exact.number_text(0.25, "0%"), "25%")
        self.assertEqual(pptx_exact.number_text(1234.5, "#,##0"), "1,235")
        self.assertEqual(pptx_exact.number_text(45566, "yyyy/m/d"), "2024/10/1")
        self.assertEqual(pptx_exact.number_text(45566, 'm"月"'), "10月")


class SourceEffectsTest(unittest.TestCase):
    def test_every_slide_beyond_the_old_fifty_slide_limit_survives(self):
        prs = Presentation()
        for i in range(51):
            slide = prs.slides.add_slide(prs.slide_layouts[6])
            slide.shapes.add_textbox(Inches(1), Inches(1), Inches(3), Inches(1)).text = f"Page {i + 1}"
        out = io.BytesIO()
        prs.save(out)
        deck = read_pptx_exact(out.getvalue())
        self.assertEqual(len(deck["slideData"]), 51)
        self.assertIn("Page 51", str(deck["slideData"][-1]))

    def test_a_source_gradient_shadow_and_font_survive_import(self):
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        shape = slide.shapes.add_shape(1, Inches(1), Inches(1), Inches(4), Inches(2))
        shape.text = "Gradient"
        shape.text_frame.paragraphs[0].runs[0].font.name = "Arial"
        sppr = shape._element.spPr
        for child in list(sppr):
            if etree.QName(child).localname in ("solidFill", "noFill"):
                sppr.remove(child)
        sppr.append(etree.fromstring('''<a:gradFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:gsLst>
          <a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs>
          </a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill>'''))
        sppr.append(etree.fromstring('''<a:effectLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:outerShdw blurRad="91440" dist="91440" dir="0"><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:outerShdw>
          </a:effectLst>'''))
        out = io.BytesIO()
        prs.save(out)
        deck = read_pptx_exact(out.getvalue())
        imported = by_text(deck["slideData"][0], "Gradient")
        self.assertEqual(deck["slideData"][0]["master"], "source")
        self.assertEqual(imported["fontFace"], "Arial")
        self.assertEqual([s["color"] for s in imported["gradient"]["stops"]], ["#ff0000", "#0000ff"])
        self.assertEqual(imported["gradient"]["angle"], 90)
        self.assertAlmostEqual(imported["shadow"]["opacity"], 0.5)


if __name__ == "__main__":
    unittest.main()
