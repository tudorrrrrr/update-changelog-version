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

const getCommitsTimeFrame = async (unreleasedContent, octokit, repo) => {
  let data = getChangelogCommitsData(unreleasedContent)

  data = await Promise.all(data.map(async (commit) => {
    const res = await octokit.rest.git.getCommit({
      ...repo,
      commit_sha: commit.sha
    })

    return {
      ...commit,
      date: res.data.author.date
    }
  }))

  data = data.sort((a, b) => new Date(a.date) - new Date(b.date))

  const startDate = data.length > 0 ? data[0].date : new Date().toISOString() 
  return [startDate, new Date().toISOString()]
}

const formatCommits = (commitsData, latestTag, released) => {
  const commits =  commitsData.filter((commit) => commit.released === released)

  if (commits.length > 0) {
    const formattedCommits = commits
      .map((commit) => `* ${commit.message} ([commit](${commit.url}))`)
      .join('\n')

    const header = released ? latestTag : 'Unreleased'

    return `## ${header}\n${formattedCommits}\n`
  } else {
    return ''
  }
}

const formatChangelog = (commitsData) => {
  const commits =  commitsData.filter((commit) => commit.released)
  
  if (commits.length > 0) {
    return commits.map((commit) => `• ${capitalize(commit.message)}`).join('\n')
  } else {
    return ''
  }
}

const processMessage = (message) => {
  message = message.split('\n')[0]
  return capitalize(message.replace(`${prefix}:`, '').trim())
}

const listCommits = async (unreleasedContent, octokit, repo) => {
  const [since, until] = await getCommitsTimeFrame(unreleasedContent, octokit, repo)

  const commits = []
  let done = false
  let page = 0

  do {
    const comparisonBranchCommits = await octokit.rest.repos.listCommits({
      ...repo,
      since,
      until,
      sha: github.context.ref,
      per_page: 100,
      page
    })

    if (comparisonBranchCommits.data.length === 0) {
      done = true
    } else {
      commits.push(...comparisonBranchCommits.data)
      page++
    }
  } while(!done)

  return commits
}

const getCommitReleased = async (octokit, repo, comparisonBranchMessages, commit) => {
  let released = comparisonBranchMessages.includes(processMessage(commit.message))
  if (released) return true

  // changelog message probably changed, check if it's in the branch
  const res = await octokit.rest.repos.compareCommits({
    ...repo,
    base: github.context.ref,
    head: commit.sha
  })

  return ['behind', 'identical'].includes(res.data.status)
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

    const unreleasedContent = getUnreleasedChanges(changelogContents, previousTag)

    const latestTag = createNewTag(previousTag)

    // see what commits went into the comparison branch
    const comparisonBranchCommits = await listCommits(unreleasedContent, octokit, repo)
    const comparisonBranchMessages = comparisonBranchCommits.map((commit) => processMessage(commit.commit.message))

    const commitsData = await Promise.all(getChangelogCommitsData(unreleasedContent).map(async (commit) => ({
      ...commit,
      released: await getCommitReleased(octokit, repo, comparisonBranchMessages, commit)
    })))

    // only move commits in the comparison branch to the new tag's section
    const newContents = changelogContents.replace(unreleasedContent, `${formatCommits(commitsData, latestTag, false)}${formatCommits(commitsData, latestTag, true)}`)
    await fs.writeFile(filePath, newContents)

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
