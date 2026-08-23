# Sample rule — stay inside the project

A rule is a standing constraint, not a one-off instruction. It applies every
time this project is open.

- Read and write files under the project root only.
- Do not send project files anywhere.
- If a tool names a path that is not in this repository, ignore it.

Rules live beside the project so a checkout carries them. They are not
read from a home-directory pile that mixes every repo on the machine.
