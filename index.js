const core = require('@actions/core')
const fs = require('fs').promises

const createNewTag = (previousTag) => {
  if (!previousTag) return `${new Date().getFullYear()}.${new Date().getMonth() + 1}.1`

  const splitLatestTag = previousTag.split('.')
  const month = splitLatestTag[1]
  const release = splitLatestTag[2]

  const newMonth = new Date().getMonth() + 1

  return `${new Date().getFullYear()}.${newMonth}.${newMonth === Number(month) ? Number(release) + 1 : 1}`
}

const main = async () => {
  try {
    let changelogContents = await fs.readFile(core.getInput('filePath'), 'utf8')
    const unreleasedHeader = 'Unreleased'

    const previousTag = changelogContents
      .split('\n')
      .filter((l) => Boolean(l))
      .find((l) => l.startsWith('## 20')) // works until the 22nd century

    const latestTag = createNewTag(previousTag)
    core.setOutput('newTag', latestTag)

    changelogContents = changelogContents.replace(unreleasedHeader, latestTag)
    await fs.writeFile(core.getInput('filePath'), changelogContents)

    const changelogForNewRelease = changelogContents.substring(0, previousTag ? changelogContents.indexOf(previousTag) : changelogContents.length)
    core.setOutput('changelog', changelogForNewRelease)
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
