## Purpose

Protects the notebook's directory tree from silent clobbering: tree writes are version-checked, a client that could only read stale or local data may never overwrite the cloud tree, sign-in merges guest drafts instead of replacing, and any earlier tree version can be inspected and restored.

## ADDED Requirements

### Requirement: Tree revision is reported on read

The system SHALL return the directory tree together with a revision identifier for that stored version, so a client can state which version it edited.

#### Scenario: Reading the tree
- **WHEN** an authenticated client reads its directory tree
- **THEN** the response carries both the tree and a revision identifier for the stored version

#### Scenario: Revision changes after a write
- **WHEN** a tree write succeeds
- **THEN** the revision reported for the tree differs from the revision the client supplied as its base

### Requirement: Tree writes are conditional on the base revision

The system SHALL reject a directory tree write whose stated base revision does not match the stored revision, and SHALL NOT modify the stored tree in that case.

#### Scenario: Write with a matching base revision
- **WHEN** a client writes the tree stating the revision it last read, and that revision is still current
- **THEN** the write is applied and the response carries the new revision

#### Scenario: Write with a stale base revision
- **WHEN** a client writes the tree stating a revision that is no longer current
- **THEN** the request is rejected with a conflict outcome, the stored tree is left unchanged, and the response carries the current revision

#### Scenario: Write without a base revision
- **WHEN** a client writes the tree without stating a base revision
- **THEN** the request is rejected and the stored tree is left unchanged

#### Scenario: Unauthenticated write
- **WHEN** a request attempts to write a tree without valid authentication
- **THEN** the request is rejected with an unauthorized outcome

### Requirement: A conflicting tree write is surfaced, never resolved silently

The app SHALL stop writing the tree to the cloud while a conflict is unresolved, and SHALL ask the user how to proceed instead of choosing on their behalf.

#### Scenario: Conflict detected
- **WHEN** the app receives a conflict outcome for a tree write
- **THEN** it suspends further automatic tree writes and presents a choice between keeping the cloud version and replacing it with the local one

#### Scenario: Automatic saving resumes
- **WHEN** the user has resolved the conflict
- **THEN** automatic tree writes resume against the revision that was just accepted

#### Scenario: Unresolved conflict does not lose local edits
- **WHEN** a conflict is pending and the user keeps editing
- **THEN** the edits are preserved locally and are not discarded by the conflict

### Requirement: Degraded reads never become authoritative writes

The app SHALL distinguish "cloud tree loaded" from "local tree only", and SHALL NOT write the tree to the cloud while it is holding a local-only tree.

#### Scenario: Cloud tree unavailable
- **WHEN** loading the directory tree from the cloud fails
- **THEN** the app uses the local tree, marks itself as being in a local-only state, and shows that state to the user

#### Scenario: Writing while local-only
- **WHEN** the app is in the local-only state and the user changes the directory tree
- **THEN** the change is kept locally and no tree write is sent to the cloud

#### Scenario: Recovering the cloud tree
- **WHEN** a later load of the directory tree from the cloud succeeds
- **THEN** the app leaves the local-only state and cloud tree writes become available again

### Requirement: Guest drafts merge on sign-in

When a signed-in user chooses to upload drafts created while signed out, the app SHALL merge the local directory tree into the cloud tree by node identity, and SHALL NOT replace the cloud tree wholesale.

#### Scenario: Merging disjoint trees
- **WHEN** the local tree and the cloud tree contain different nodes
- **THEN** the resulting tree contains both sets, with the cloud tree's existing nodes preserved

#### Scenario: Merging shared nodes
- **WHEN** a node identity exists in both trees
- **THEN** a single node remains and the cloud layout for that node is preserved

#### Scenario: Empty local tree
- **WHEN** the local tree has no root nodes
- **THEN** the cloud tree is left unchanged

#### Scenario: Merge respects the current revision
- **WHEN** the cloud tree changed between loading and merging
- **THEN** the merge is not applied blindly, and the user is asked how to proceed

### Requirement: Tree version history and restore

The system SHALL expose the directory tree's stored versions and let the owner restore one of them.

#### Scenario: Listing versions
- **WHEN** the owner requests the directory tree's history
- **THEN** the versions are returned newest first, each with a timestamp and a label

#### Scenario: Reading a version
- **WHEN** the owner requests a specific version
- **THEN** the directory tree as stored in that version is returned

#### Scenario: Restoring a version
- **WHEN** the owner restores a version
- **THEN** that version's tree becomes the stored tree, and the restore obeys the same base-revision rule as any other write

#### Scenario: History is owner-only
- **WHEN** a request for tree history or a tree version is not authenticated as the tree's owner
- **THEN** the request is rejected

### Requirement: Orphan note audit

The system SHALL provide a read-only audit that reports inconsistencies between the notes referenced by a directory tree and the note files that exist.

#### Scenario: Notes missing from the tree
- **WHEN** the audit runs and a note file exists that the tree does not reference
- **THEN** that note is reported as an orphan

#### Scenario: Tree references without content
- **WHEN** the audit runs and the tree references a note whose file does not exist
- **THEN** that reference is reported as dangling

#### Scenario: Duplicate node identities
- **WHEN** the same node identity appears more than once in a tree
- **THEN** the audit reports it

#### Scenario: Audit performs no writes
- **WHEN** the audit runs
- **THEN** it does not modify notes or the tree
