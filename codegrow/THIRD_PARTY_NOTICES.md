# Third-party notices

CodeGrow's MIT license covers the original CodeGrow source code. It does not
relicense third-party packages, AI model weights, the WebAssembly compiler, its runtime libraries,
or the pre-existing projects elsewhere in this repository. Those components
retain their own copyright notices and license terms.

## WebAssembly compiler and standard library

CodeGrow compiles C locally in the browser using a historical Clang/LLD WASI
build and `sysroot.tar`. The exact binary download URLs and SHA-256 hashes are
recorded in `src/services/compiler-assets.json`. The binaries are external
generated assets; a hash identifies their contents, not their license.

The original demo is [binji/wasm-clang](https://github.com/binji/wasm-clang).
Its README identifies the Clang compiler, LLD linker, and C/C++ system headers
and libraries, and links the modified LLVM source. The demo code carries
Apache-2.0 terms. The archived LLVM 8.0.1 components carry the licenses below;
they must not be relabeled as MIT or as the modern LLVM license.

| Component | Terms and retained notice |
| --- | --- |
| binji WebAssembly Clang demo | [Apache-2.0](resources/licenses/BINJI-WASM-CLANG-APACHE-2.0.txt) |
| LLVM 8.0.1 | [University of Illinois/NCSA](resources/licenses/LLVM-8.0.1-NCSA.txt) |
| Clang 8.0.1 | [University of Illinois/NCSA](resources/licenses/CLANG-8.0.1-NCSA.txt) |
| LLD 8.0.1 | [University of Illinois/NCSA](resources/licenses/LLD-8.0.1-NCSA.txt) |
| libc++ 8.0.1 | [NCSA / MIT dual license](resources/licenses/LIBCXX-8.0.1.txt) |
| libc++abi 8.0.1 | [NCSA / MIT dual license](resources/licenses/LIBCXXABI-8.0.1.txt) |
| compiler-rt 8.0.1 | [NCSA / MIT dual license](resources/licenses/COMPILER-RT-8.0.1.txt) |
| LLVM regex contribution | [OpenBSD notice](resources/licenses/LLVM-8.0.1-OPENBSD-REGEX.txt) |
| LLVM MD5 contribution | [Solar Designer notice](resources/licenses/LLVM-8.0.1-MD5.txt) |
| LLVM ARM contributions | [ARM software grant](resources/licenses/LLVM-8.0.1-ARM.txt) |
| Historical wasi-libc | [Component license index](resources/licenses/WASI-LIBC-v0.1-alpha-NOTICE.txt) |
| musl components | [MIT and additional component notices](resources/licenses/WASI-LIBC-v0.1-alpha-MUSL-COPYRIGHT.txt) |
| cloudlibc components | [BSD-2-Clause](resources/licenses/WASI-LIBC-v0.1-alpha-CLOUDLIBC-BSD.txt) |
| libpreopen components | [BSD-2-Clause](resources/licenses/WASI-LIBC-v0.1-alpha-LIBPREOPEN.txt) |
| Other historical wasi-libc components | [CC0-1.0](resources/licenses/WASI-LIBC-v0.1-alpha-CC0.txt) |

The license texts are copied from fixed, publicly available upstream revisions:

- `binji/wasm-clang`: `648c4a89997a351eef75cdaec3ef5b89d4937dec`.
- Official `llvm/llvm-project`, tag `llvmorg-8.0.1`: commit
  `19a71f6bdf2dddb10764939e7f0ec2b98dba76c9`.
- `WebAssembly/wasi-libc`, tag `v0.1-alpha`: commit
  `d5a609fe63926533e1054e539ba5f2693d51bdf5`.

These references preserve historical upstream terms. The external binary
package does not currently provide a complete reproducible build manifest
linking every sysroot object to an exact source revision. The wasi-libc snapshot
above is a historical license reference, not a claim that its commit has been
proven to be the precise source of this binary. Headers in the supplied sysroot
identify libc++'s MIT/NCSA terms and WASI/musl origins. Binary-package provenance
should be completed when replacing or rebuilding the historical toolchain;
retain all applicable source-specific notices during that work. npm wrapper
metadata alone is not a license determination for compiler binaries.

`resources/licenses/SOURCES.json` records the exact HTTPS source of each retained
text. The compiler preparation script copies these notices alongside generated
compiler assets for distribution. Keep the notices with any mirrored compiler,
static-site build, or downloadable application artifact.

## JavaScript packages

The following directly used packages are installed from the project's lockfile.
Their original license texts are retained without substituting CodeGrow's MIT
notice. Runtime packages may include additional transitive dependencies whose
notices remain in their distributions and generated bundle comments.

| Package | Installed version | Terms |
| --- | --- | --- |
| React | 19.2.8 | [MIT](resources/licenses/NPM-react.txt) |
| React DOM | 19.2.8 | [MIT](resources/licenses/NPM-react-dom.txt) |
| Zustand | 5.0.15 | [MIT](resources/licenses/NPM-zustand.txt) |
| Lucide React | 1.55.0 | [ISC / included Feather MIT notices](resources/licenses/NPM-lucide-react.txt) |
| Monaco Editor | 0.55.1 | [MIT](resources/licenses/NPM-monaco-editor.txt) |
| @monaco-editor/react | 4.7.0 | [MIT](resources/licenses/NPM-monaco-editor-react.txt) |
| @runno/wasi | 0.10.0 | [MIT](resources/licenses/NPM-runno-wasi.txt) |
| sql.js | 1.14.2 | [MIT; SQLite is public domain](resources/licenses/NPM-sql.js.txt) |
| @mlc-ai/web-llm | 0.2.85 | [Apache-2.0 and bundled protocol notice](resources/licenses/NPM-web-llm.txt) |
| loglevel (WebLLM runtime dependency) | 1.9.2 | [MIT](resources/licenses/NPM-loglevel.txt) |

Dependency upgrades and toolchain replacements must update this list and retain
the corresponding original license and attribution texts.

## Optional local AI models

The browser-local tutor uses Qwen2.5-Coder **1.5B-Instruct** and **7B-Instruct**,
published by the Qwen Team, through the `mlc-ai` quantized model repositories
listed in WebLLM 0.2.85's official model catalog. CodeGrow does not bundle or
commit model weights; the learner explicitly downloads a selected model into
their browser cache from Hugging Face, or from a separately selected third-party
HF-Mirror source. Model libraries come from MLC's official binary library catalog.

Qwen's official model release explicitly licenses the 1.5B and 7B weights under
**Apache-2.0**, and states that both Base and Instruct models were released for
each size. This is a model-weight licensing declaration, not an inference from a
source-code repository's LICENSE. The release also gives the 3B model different
Qwen-Research terms; the 3B model is not offered by CodeGrow.

The verbatim declaration and table are retained in
[QWEN2.5-CODER-MODEL-LICENSE.md](resources/licenses/QWEN2.5-CODER-MODEL-LICENSE.md),
from the [official release source at a fixed revision](https://github.com/QwenLM/qwenlm.github.io/blob/7e70adff995f86c62e7ad1fe3c8645dc9f0a48ef/content/blog/qwen2.5-coder-family/index.md).
A complete copy of the generic [Apache-2.0 terms](resources/licenses/APACHE-2.0.txt)
is included; its source is recorded separately and does not establish which
models use those terms.

Verification scope: the upstream Qwen weight license and official WebLLM model
IDs/URLs have been checked. The cloud environment's proxy rejected CONNECT to
Hugging Face with HTTP 403, so the quantized MLC repositories' own model cards,
LICENSE/NOTICE files, shard inventories, and exact download sizes were not
independently inspected. This is not a claim that those files do not exist, or
that Hugging Face is unavailable on the learner's computer. No model weights
have been downloaded or rehosted in this repository. Before mirroring,
redistributing, or modifying weights or model-library binaries, obtain the
original distributions and retain all applicable copyright and NOTICE files;
this record alone is not a complete artifact-level redistribution audit.

See [the local AI guide](docs/LOCAL_AI.md) for supported hardware, download
sources, context limits, and the distinction between estimated VRAM and storage.
