# Third-party references

`vendor/mermaid.js` bundles Mermaid and its dependencies for offline
mindmap, flowchart and xychart rendering. Mermaid is MIT licensed:
https://github.com/mermaid-js/mermaid
Dependency license notices are retained inside the bundled source.

Host APIs are provided by DeepSeek Harness, MIT license:
https://github.com/deepseek-ai/deepseek-harness

The per-turn observable subscription pattern in `src/adapter.ts` is adapted
from dsh-compact-lane by KryptonGao, Apache License 2.0:
https://github.com/KryptonGao/dsh-compact-lane/blob/92451e187981a45834a2bd432a51522ea4d0e0b5/src/adapter/source.ts

The adapted function is modified to use the DSH Focus turn model. The original
reference's author is KryptonGao. No community styles, assets, or view components
are distributed in this package.

Apache License, Version 2.0:
https://www.apache.org/licenses/LICENSE-2.0

The full Apache 2.0 license is included in `LICENSE-APACHE-2.0.txt`.

The client bundles `mdast-util-from-markdown`, `micromark` and their Markdown
parsing utilities, maintained by Titus Wormer and the unified collective.
https://github.com/syntax-tree/mdast-util-from-markdown

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to
do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
