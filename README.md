# Changelog versioning

A GitHub action for grouping changelogs using calendar versioning.

Using the [push to changelog action](https://github.com/blackbullion/push-to-changelog), every commit starting with a specified prefix (e.g. `changelog: add new feature`) gets added to your changelog file. You can then use this action to group commits by the version they were released in.

## Inputs

| Input       | Required    | Description
| ----------- | ----------- | -----------
| token       | yes         | Your GitHub token (i.e. `${{ secrets.GITHUB_TOKEN }}`)
| filePath    | no          | Path to your changelog. Default: `CHANGELOG.md`
| prefix      | no          | What commits need to start with to be added to the changelog. Default: `changelog`

## Outputs

| Output      | Required    
| ----------- | -----------
| newTag      | New calendar version (e.g. 2021.5.3)        
| changelog   | A bullet-pointed list of the changes that were moved to the newest version         

## Pushing to the changelog

This action goes hand-in-hand with our [push to changelog action](https://github.com/blackbullion/push-to-changelog). Here's an example of what this workflow could look like:

On push to your development branch:

```
steps:
  - uses: actions/checkout@v2

  - uses: blackbullion/push-to-changelog@v1
    with:
      token: ${{ secrets.GITHUB_TOKEN }}

  - name: Push updated changelog
```

And on push to your release branch:

```
steps:
  - uses: actions/checkout@v2
    with:
      ref: develop

  - uses: blackbullion/update-changelog-version@v1
    with:
      token: ${{ secrets.GITHUB_TOKEN }}

  - name: Push updated changelog to the development branch

  - name: Post to slack
```
The push to changelog action adds commits to the `Unreleased` section of your changelog.

When the update changelog version action runs, it takes every commit from the unreleased section and moves them under a new section labelled by the latest release version (using calendar versioning, e.g. 2021.5.3).

Only commits that exist in the branch the versioning action runs in (usually your release branch) get moved out of the unreleased section allowing you to do cherry-picked releases.
