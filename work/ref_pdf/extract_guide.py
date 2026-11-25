import sys
from pypdf import PdfReader

src = r"C:\Users\liutian\Desktop\三国群英传2_全界面按键说明_给小朋友讲.pdf"
out = r"F:\sanguo\work\ref_pdf\sanguo2_guide.txt"
reader = PdfReader(src)
parts = []
for i, page in enumerate(reader.pages, 1):
    parts.append(f"\n===== PAGE {i} =====\n")
    parts.append(page.extract_text() or "")
text = "".join(parts)
with open(out, "w", encoding="utf-8") as f:
    f.write(text)
print("pages", len(reader.pages), "chars", len(text))
print(text[:1500])
