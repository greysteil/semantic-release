const {sortBy} = require('lodash');
const semver = require('semver');
const {FIRST_RELEASE} = require('../definitions/constants');
const {
  tagsToVersions,
  isMajorRange,
  getUpperBound,
  getLowerBound,
  highest,
  lowest,
  getLatestVersion,
  getFirstVersion,
  getRange,
} = require('../utils');

// TODO add logs and debug

function lts({lts, release}) {
  return sortBy(
    lts.map(({name, range, channel, ...rest}) => ({...rest, name, range: range || name, channel: channel || name})),
    'range'
  ).map(({name, range, tags, ...rest}, idx, branches) => {
    const versions = tagsToVersions(tags);
    // Find the lower bound based on LTS branches
    const ltsMin =
      // If the current branch has a major range (1.x or 1.x.x) and the previous doesn't
      isMajorRange(range) && branches[idx - 1] && !isMajorRange(branches[idx - 1].range)
        ? // Then the lowest bound is the upper bound of the previous branch range
          getUpperBound(branches[idx - 1].range)
        : // Otherwise the lowest bound is the lowest bound of the current branch range
          getLowerBound(range);
    // The actual lower bound is the highest version between the current branch last release and `ltsMin`
    const min = highest(getLatestVersion(versions) || FIRST_RELEASE, ltsMin);
    // Determine the first release of the default branch not present in any LTS branch
    const base =
      (release[0] &&
        (getFirstVersion(tagsToVersions(release[0].tags), lts) || getLatestVersion(tagsToVersions(release[0].tags)))) ||
      FIRST_RELEASE;
    // The upper bound is the lowest version between the `base` version and the upper bound of the current branch range
    const max = lowest(base, getUpperBound(range));
    return {...rest, type: 'lts', name, tags, range: getRange(min, max)};
  });
}

function release({release}) {
  if (release.length === 0) {
    return release;
  }
  const breakpoints = release.length > 2 ? ['minor', 'major'] : ['major'];

  // The intial bound is the last release from the base branch of `FIRST_RELEASE` (1.0.0)
  let bound = getLatestVersion(tagsToVersions(release[0].tags)) || FIRST_RELEASE;

  return release.map(({name, tags, channel, ...rest}, idx) => {
    const versions = tagsToVersions(tags);
    // The lower bound is the highest version between the current branch last release and the previous branch upper bound (`bound`)
    const min = highest(getLatestVersion(versions), bound);
    if (release.length - 1 === idx) {
      // If the current branch is the last one of the release branch, there is no upper bound
      bound = undefined;
    } else {
      // The default upper bound is the lower bound increment with the release type of the current branch position
      const upperBound = semver.inc(min, breakpoints[idx]);
      // Find the lowest version that is present on the current branch but none of the previous ones
      const nextFirstVersion = getFirstVersion(tagsToVersions(release[idx + 1].tags), release.slice(0, idx + 1));
      // The upper bound is the lowest version between `nextFirstVersion` and the default upper bound
      bound = lowest(nextFirstVersion, upperBound);
    }
    return {
      ...rest,
      channel: idx === 0 ? channel : channel || name,
      tags,
      type: 'release',
      name,
      range: getRange(min, bound),
    };
  });
}

function prerelease({prerelease}) {
  return prerelease.map(({name, prerelease, channel, tags, ...rest}) => {
    const preid = prerelease === true ? name : prerelease;
    return {
      ...rest,
      channel: channel || name,
      type: 'prerelease',
      name,
      prerelease: preid,
      tags,
      range: getRange(getLatestVersion(tagsToVersions(tags), {prerelease: true}) || `${FIRST_RELEASE}-${preid}.1`),
    };
  });
}

module.exports = {lts, release, prerelease};