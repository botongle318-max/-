# Third-party notices

CodeGrow's MIT license covers the original CodeGrow source code. It does not
relicense third-party packages, the WebAssembly compiler, its runtime libraries,
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

Dependency upgrades and toolchain replacements must update this list and retain
the corresponding original license and attribution texts.
