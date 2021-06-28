const core = require('@actions/core')
const github = require('@actions/github')
const fs = require('fs').promises
const capitalize = require('lodash.capitalize')

const prefix = core.getInput('prefix') || 'changelog'

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

  return changelogContents.substring(0, end)
}

const getChangelogCommitsData = (unreleasedContent) => {
  return unreleasedContent
    .split('\n')
    .filter((l) => Boolean(l) && !l.startsWith('##'))
    .map((line) => {
      const url = line.split('[commit]')[1].replace(/[()]/g, '')

      return {
        message: line.split(' ([commit]')[0].replace('* ', ''),
        sha: url.split('commit/')[1],
        url
      }
    })
}

const formatCommits = (commitsData, latestTag, released) => {
  const commits =  commitsData.filter((commit) => commit.released === released)

  if (commits.length > 0) {
    const formattedCommits = commits
      .map((commit) => `* ${commit.message} ([commit](${commit.url}))`).
      join('\n')

    const header = released ? latestTag : 'Unreleased'

    return `## ${header}\n${formattedCommits}\n`
  } else {
    return ''
  }
}

const formatChangelog = (commitsData) => {
  const commits =  commitsData.filter((commit) => commit.released)
  
  if (commits.length > 0) {
    return commits.map((commit) => `• ${commit.message}`).join('\n')
  } else {
    return ''
  }
}

const processMessage = (message) => {
  message = message.split('\n')[0]
  return capitalize(message.replace(`${prefix}:`, '').trim())
}

const main = async () => {
  try {
    const token = core.getInput('token')
    const octokit = github.getOctokit(token)  
    const repo = github.context.repo

    const filePath = core.getInput('filePath') || 'CHANGELOG.md'
    const changelogContents = await fs.readFile(filePath, 'utf8')

    const previousTag = changelogContents
      .split('\n')
      .filter((l) => Boolean(l))
      .find((l) => l.startsWith('## 20')) // works until the 22nd century

    const latestTag = createNewTag(previousTag)

    // see what commits went into the comparison branch
    const comparisonBranchCommits = await octokit.rest.repos.listCommits({
      ...repo,
      sha: github.context.ref
    })

    comparisonBranchMessages = comparisonBranchCommits.data.map((commit) => processMessage(commit.commit.message))

    // mark as released if the sha exists in the comparison branch
    const unreleasedContent = getUnreleasedChanges(changelogContents, previousTag)

    core.info(`Raw unreleased markdown: ${unreleasedContent}`)

    const commitsData = getChangelogCommitsData(unreleasedContent).map((commit) => ({
      ...commit,
      released: comparisonBranchMessages.includes(processMessage(commit.message))
    }))

    // only move commits in the comparison branch to the new tag's section
    await fs.writeFile(
      core.getInput('filePath'),
      changelogContents.replace(unreleasedContent, `${formatCommits(commitsData, latestTag, false)}${formatCommits(commitsData, latestTag, true)}`)
    )

    const changelogForNewRelease = formatChangelog(commitsData)

    core.setOutput('newTag', latestTag)
    core.setOutput('changelog', changelogForNewRelease)

    core.startGroup('Outputs')
    core.info(`newTag: ${latestTag}`)
    core.info(`changelog:\n${changelogForNewRelease || 'No new changes'}`)
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
