"""Generates a sample PDF lesson for manually testing the content pipeline.

Deliberately includes: technical vocabulary (stresses simplification profiles),
a spatial reference and a symbol/abbreviation (stresses the blind profile's
de-spatialising and symbol-spelling rules), several distinct named concepts
(stresses quiz topic/conceptId tagging), and enough length to cross the
6000-char chunking boundary in nlp_simplify.py.

Usage: cd backend && python scripts/make_sample_pdf.py
Output: backend/sample_lesson.pdf
"""

from fpdf import FPDF

TITLE = "The Water Cycle"

BODY = """The water cycle is the continuous movement of water within the Earth and
atmosphere. It is a complex system that includes many different processes.
Liquid water evaporates into water vapor, condenses to form clouds, and
precipitates back to Earth in the form of rain or snow.

Evaporation occurs when the sun heats up water in rivers, lakes, and oceans
and turns it into vapor or steam. The water vapor leaves the river, lake, or
ocean and goes into the air. As shown in the diagram above, roughly 90% of
atmospheric moisture comes from evaporation off the surface of oceans, with
the remainder coming from transpiration in plants.

Condensation is the process by which water vapor in the air is changed into
liquid water. Condensation is crucial to the water cycle because it is
responsible for the formation of clouds. These clouds may produce
precipitation, which is the primary route for water to return to the Earth's
surface within the water cycle.

Precipitation occurs when so much water has condensed that the air cannot
hold it anymore. The clouds become saturated with water droplets, and the
droplets fall from the sky as rain, hail, sleet, or snow, depending on the
temperature of the surrounding air.

Collection happens when water pools in large bodies like oceans, lakes, and
rivers, e.g. the Amazon River or the Pacific Ocean. Some of the water is
absorbed into the ground through a process called infiltration, where it
becomes groundwater that plants and trees can use.

Groundwater eventually seeps back into rivers and streams, continuing the
cycle. Scientists estimate that a single water molecule spends about nine
days in the atmosphere before falling back to Earth, and can take thousands
of years to move through an underground aquifer.

Human activity affects the water cycle in significant ways. Deforestation
reduces transpiration, urbanization increases runoff by covering soil with
impermeable surfaces, and climate change is altering evaporation rates and
precipitation patterns across the globe. Understanding the water cycle helps
scientists predict weather, manage freshwater resources, and study the
effects of climate change on ecosystems worldwide."""


def build_pdf(path: str) -> None:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 12, TITLE, ln=True)
    pdf.set_font("Helvetica", "", 12)
    pdf.ln(4)
    # multi_cell wraps and preserves paragraph breaks; latin-1 covers this text.
    pdf.multi_cell(0, 7, BODY.encode("latin-1", "replace").decode("latin-1"))
    pdf.output(path)


if __name__ == "__main__":
    build_pdf("sample_lesson.pdf")
    print("Wrote backend/sample_lesson.pdf")
