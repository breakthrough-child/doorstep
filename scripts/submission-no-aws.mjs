// Produce SUBMISSION.no-aws.md: SUBMISSION.md with the AWS Builder material removed.
import fs from "node:fs";

let s = fs.readFileSync("SUBMISSION.md", "utf8");
s = s.replace(/^> \*\*If Amazon Bedrock.*\n(>.*\n)*\n?/m, ""); // the editor's note itself
s = s.replace(/<!-- AWS-BUILDER:START -->[\s\S]*?<!-- AWS-BUILDER:END -->\n?/g, "");
s = s.replace(/^.*<!-- AWS-BUILDER -->\n/gm, "");
s = s.replace(/<!-- NO-AWS -->\n<!-- ([\s\S]*?) -->/g, "$1");
fs.writeFileSync("SUBMISSION.no-aws.md", s);
const left = (s.match(/Bedrock|AWS/g) ?? []).length;
console.log(`Wrote SUBMISSION.no-aws.md (${left} remaining mentions of AWS/Bedrock — check they're intended).`);
