# Google Java Format Action

Automatically format your Java files using [Google Java Style guidelines](https://google.github.io/styleguide/javaguide.html).

This action automatically downloads the latest release of the [Google Java Format](https://github.com/google/google-java-format) program.

If some files need to be formatted, this action will push a commit with the modifications (unless you set the `skipCommit` input to `true`, or use the `--dry-run` argument, see below).

You must checkout your repository with `actions/checkout` before calling this action (see the example).

## Example

```yml
# Example workflow
name: Format

on:
  push:
    branches:
      - master

jobs:

  formatting:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2 # v2 minimum required
      # Recommended: latest versions of Google Java Format require JDK 11+
      - uses: actions/setup-java@v1
        with:
          java-version: '11'
      - uses: axel-op/googlejavaformat-action@v3.0.0
        with:
          args: "--skip-sorting-imports --replace"
```

## Inputs

None of these inputs is required, but you can add them to change the behavior of this action.

### `files`

A pattern to match the files to format. The default is `**/*.java`, which means that all Java files in your repository will be formatted.

### `skipCommit`

Set to `true` if you don't want the changes to be committed by this action.

### `args`

The arguments to pass to the Google Java Format executable.
By default, only `--replace` is used.

```console
-i, -r, -replace, --replace
  Send formatted output back to files, not stdout.

--assume-filename, -assume-filename
  File name to use for diagnostics when formatting standard input (default is <stdin>).

--aosp, -aosp, -a
  Use AOSP style instead of Google Style (4-space indentation).

--fix-imports-only
  Fix import order and remove any unused imports, but do no other formatting.

--skip-sorting-imports
  Do not fix the import order. Unused imports will still be removed.

--skip-removing-unused-imports
  Do not remove unused imports. Imports will still be sorted.

--dry-run, -n
  Prints the paths of the files whose contents would change if the formatter were run normally.

--set-exit-if-changed
  Return exit code 1 if there are any formatting changes.

--length, -length
  Character length to format.

--lines, -lines, --line, -line
  Line range(s) to format, like 5:10 (1-based; default is all).

--offset, -offset
  Character offset to format (0-based; default is all).
```

Note:

- If you add `--dry-run` or `-n`, no commit will be made.
- The argument `--set-exit-if-changed` will work as expected and this action will fail if some files need to be formatted.
