## Purpose

Defines the in-editor AI assistant surfaces: streaming draft generation so long output appears progressively, per-note chat state that survives navigation and reloads, and asynchronous media-job polling that never spams the data repository and can be cancelled.

## ADDED Requirements

### Requirement: Streaming AI draft

The AI assistant SHALL stream generated note content to the client as it is produced, so the draft renders progressively instead of appearing only when the whole response is finished.

#### Scenario: Draft appears progressively

- **WHEN** the user asks the assistant to write or expand a note
- **THEN** generated Markdown text appears incrementally in the panel while the model is still producing it

#### Scenario: Stream completes into a draft

- **WHEN** the stream ends
- **THEN** the accumulated content becomes the draft that can be applied to the note (replace or append)

#### Scenario: Stream fails mid-flight

- **WHEN** the stream errors or is interrupted before completion
- **THEN** the partial content is kept visible and the user is offered a retry

### Requirement: Markdown-first streaming protocol

The streaming path SHALL request plain Markdown from the model rather than a JSON envelope, so content is readable while streaming.

#### Scenario: No JSON envelope in streamed output

- **WHEN** the user streams a draft
- **THEN** the streamed text is Markdown, not a `{"reply","noteMarkdown"}` JSON object

#### Scenario: Blocking path unchanged

- **WHEN** a request uses the non-streaming path
- **THEN** the existing JSON protocol and its parsing still work

### Requirement: Durable per-note chat state

The assistant SHALL persist the conversation per note locally and restore it when the note is reopened, and SHALL remember whether the panel was expanded.

#### Scenario: Reopen a note

- **WHEN** the user returns to a note they previously chatted about
- **THEN** the previous messages are restored in the panel

#### Scenario: Reload the page

- **WHEN** the page is reloaded
- **THEN** the expanded/collapsed state and the conversation for the current note are preserved

#### Scenario: Retry a failed request

- **WHEN** an assistant request fails
- **THEN** the user is offered a retry action rather than only a transient error message

### Requirement: Non-destructive job polling

Asynchronous AI job polling SHALL NOT write to the data repository unless the job state actually changes, and SHALL be cancellable by the client.

#### Scenario: No write when nothing changed

- **WHEN** a job is polled and its status is unchanged
- **THEN** no file write (and therefore no commit) occurs

#### Scenario: Write when the job advances

- **WHEN** a job changes status, fails, or produces a result
- **THEN** the job file is written once with the new state

#### Scenario: Cancel polling

- **WHEN** the user cancels the generation or leaves the editor
- **THEN** polling stops and no further requests are sent
