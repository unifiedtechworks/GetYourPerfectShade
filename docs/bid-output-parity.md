# Generated bid visual parity

The authoritative format for this pass is the retained desktop output
`2026-08-01 - test - Perfect Shade Bid (3).docx`, SHA-256
`b6c82b81aa7e759208d48009303ee7e52a4cbf856edb673d129bdcd3ecce9c17`.
It was rendered in Microsoft Word and audited structurally rather than inferred
from prior summaries.

## Reference-derived tokens

- US Letter portrait; 0.60-inch top, 0.70-inch side, and 0.65-inch bottom margins.
- Aptos 10.5-point body/table text.
- 23-point `#1F4E79` company title and 11.5-point dark-gray proposal type.
- 13.5-point bold italic blue section headings.
- Equal-width information, pricing, and signature columns.
- `#DDEBF7` information/deposit fill, `#BDD7EE` emphasized-total fill,
  `#1F4E79` pricing header, and 0.75-point `#9FBAD0` borders.
- Centered `Perfect Shade LLC | Bid Proposal` footer.
- Natural two-page flow for a reference-density proposal.

## Signature control

The exact desktop asset is
`C:\Users\sethb\Web Projects\Perfect Shade Tool\app\assets\sheri_signature.png`:
1,467 by 379 pixels, 88,792 bytes, SHA-256
`c68a92e9b7755b71922a0a1b15667b53d531aa9bc4cb8eea94d2c296902f717a`.
The generated reference embeds the same bytes as `word/media/image1.png` at
2.6 inches wide.

The protected Lambda bundle contains the byte-identical private build asset as
`backend/estimates/assets/sheri_signature.pssig`. Esbuild's binary loader turns
it into `Uint8Array`; it is not a public Next.js image. Runtime inclusion is
enabled only when `ESTIMATE_INCLUDE_COMPANY_SIGNATURE=true`. CDK defaults the
setting to `false` pending explicit business-owner approval.

## Conditional presentation

- Alternate Pricing renders only when enabled with populated rows and remains outside the main total.
- Addenda, additional terms, Prevailing Wage, and Project Notes require populated visible content.
- Blank pricing-valid days suppress the corresponding term.
- Blank lead time suppresses the corresponding term; trailing punctuation is normalized so output never contains `Estimated lead time: .`.
- A nonzero sales-tax amount renders a visually consistent tax row. Zero tax remains represented by the approved tax-treatment term instead of an empty table row.

## Architecture and intentional differences

DOCX remains a deterministic editable document produced by the Node `docx`
library. PDF remains a direct `pdf-lib` rendering and never invokes Word,
LibreOffice, a browser, or a hosted conversion service in AWS. The preview uses
the same section order, colors, information table, pricing hierarchy, and
authorization layout.

The server PDF uses embedded Helvetica because AWS cannot assume Aptos is
installed. Line wrapping can therefore differ slightly from Word. Lifecycle
status/revision remains visible as restrained upper-right business metadata,
which is not present in the older desktop reference. The browser preview shows
signature space but never exposes the private signature bytes.

## Rendered comparison

Two representative estimates were generated as both DOCX and direct PDF: a
reference-density proposal matching the sparse approved sample and a
feature-rich proposal exercising multiple scope and pricing rows, alternates,
addenda, custom terms, Prevailing Wage, every constant section, project notes,
and signature support. Both formats rendered as valid two-page documents.

Rendered inspection confirmed the reference company/metadata header,
light-blue information labels, dark-blue pricing headers, emphasized total
rows, right-aligned money, natural section flow, two-column authorization area,
exact signature image, and centered footer. Blank pricing-valid and lead-time
values were also exercised and produced no malformed client text.

Meaningful remaining differences are limited to the direct PDF's embedded
Helvetica metrics, which wrap some long constant paragraphs differently from
Word/Aptos, and the intentionally retained lifecycle status/revision metadata.
To avoid an orphaned heading, the PDF may move Craftsmanship Warranty to page 2
for a sparse proposal where Word keeps the entire section at the bottom of page
1. The browser preview follows document hierarchy but does not simulate Word
pagination or expose the private signature image.
