const core = require('@actions/core')
const github = require('@actions/github')
const fs = require('fs').promises

const createNewTag = (previousTag) => {
  if (!previousTag) return `${new Date().getFullYear()}.${new Date().getMonth() + 1}.1`

  const splitLatestTag = previousTag.split('.')
  const month = splitLatestTag[1]
  const release = splitLatestTag[2]

  const newMonth = new Date().getMonth() + 1

  return `${new Date().getFullYear()}.${newMonth}.${newMonth === Number(month) ? Number(release) + 1 : 1}`
}

const getUnreleasedChanges = (changelogContents, previousTag) => {
  const end = previousTag
    ? changelogContents.indexOf(previousTag)
    : changelogContents.length

  return changelogContents
    .substring(0, end)
    .replace('## Unreleased', '')
}

const getChangelogCommitsData = (unreleasedContent) => {
  return unreleasedContent
    .split('\n')
    .filter((l) => Boolean(l))
    .map((line) => {
      const url = line.split('[commit]')[1].replace(/[()]/g, '')

      return {
        message: line.split(' ([commit]')[0],
        sha: url.split('commit/')[1]
      }
    })
}

const formatCommits = (commitsData, latestTag, released) => {
  const commits =  commitsData.filter((commit) => commit.released === released)

  if (commits.length > 0) {
    const formattedCommits = commits
      .map((commit) => `* ${commit.message} ([commit](${commit.sha}))`).
      join('\n')

    const header = released ? latestTag : 'Unreleased'

    return `## ${header}\n${formattedCommits}\n`
  } else {
    return ''
  }
}

const formatChangelog = (commitsData) => {
  const commits =  commitsData.filter((commit) => commit.released === released)
  
  if (commits.length > 0) {
    return commits.map((commit) => `• ${commit.message}`).join('\n')
  } else {
    return ''
  }
}

const main = async () => {
  try {
    const token = core.getInput('token')
    const octokit = github.getOctokit(token)  
    const repo = github.context.repo

    const changelogContents = await fs.readFile(core.getInput('filePath'), 'utf8')

    const previousTag = changelogContents
      .split('\n')
      .filter((l) => Boolean(l))
      .find((l) => l.startsWith('## 20')) // works until the 22nd century

    const latestTag = createNewTag(previousTag)

    // see what commits went into the comparison branch
    const comparisonBranchCommits = await octokit.rest.repos.listCommits({
      ...repo,
      sha: core.getInput('comparisonBranch'),
      per_page: commitsData.length
    })

    comparisonBranchSHAs = comparisonBranchCommits.data.map((commit) => commit.sha)

    const unreleasedContent = getUnreleasedChanges(changelogContents, previousTag)
    const commitsData = getChangelogCommitsData(unreleasedContent).map((commitData) => ({
      ...commitData,
      released: comparisonBranchSHAs.includes(commitData.sha)
    }))

    // only move commits in the comparison branch to the new tag's section
    await fs.writeFile(core.getInput('filePath'), changelogContents.replace(unreleasedContent, `
      ${formatCommits(commitsData, latestTag, false)}
      ${formatCommits(commitsData, latestTag, true)}
    `))

    const changelogForNewRelease = formatChangelog(commitsData)
    core.info(changelogForNewRelease)

    core.setOutput('newTag', latestTag)
    core.setOutput('changelog', changelogForNewRelease)
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
