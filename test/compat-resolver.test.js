import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareDshVersions,
  latestDshVersion,
  satisfiesPeerRange,
  peerRangeBounds,
  minPeerVersion,
} from "../scripts/check-dsh-compat.mjs";

test("the latest 0.2.x resolver follows semver, not locale ordering", () => {
  // localeCompare(..., { numeric: true }) orders 0.2.2-beta.1 above 0.2.2;
  // semver precedence puts the prerelease below its stable release.
  const versions = [
    "0.2.0",
    "0.2.0-rc.2",
    "0.2.0-rc.10",
    "0.2.1",
    "0.2.1-alpha.1",
    "0.2.2",
    "0.2.2-beta.1",
    "0.2.10",
  ];
  assert.equal(latestDshVersion(versions), "0.2.10");
});

test("a release sorts above its own prereleases (same MAJOR.MINOR.PATCH)", () => {
  assert.equal(compareDshVersions("0.2.2-beta.1", "0.2.2"), -1);
  assert.equal(latestDshVersion(["0.2.2", "0.2.2-beta.1"]), "0.2.2");
});

test("numeric prerelease identifiers compare numerically", () => {
  assert.equal(compareDshVersions("0.2.0-rc.2", "0.2.0-rc.10"), -1);
  assert.equal(latestDshVersion(["0.2.0-rc.2", "0.2.0-rc.10"]), "0.2.0-rc.10");
});

test("prereleases sort below any release of the same base", () => {
  assert.equal(compareDshVersions("0.1.7-rc.2", "0.1.7"), -1);
  assert.equal(compareDshVersions("0.2.1-alpha.1", "0.2.1"), -1);
});

test("the prefix filter ignores other series", () => {
  assert.equal(latestDshVersion(["0.1.7-rc.2", "0.2.0-rc.2", "1.0.0"]), "0.2.0-rc.2");
  assert.throws(() => latestDshVersion(["0.1.7-rc.2"]), /no DSH/);
});

test("satisfiesPeerRange enforces both declared bounds", () => {
  const range = ">=0.1.7-rc.1 <0.3.0";
  assert.ok(satisfiesPeerRange("0.1.7-rc.1", range));
  assert.ok(satisfiesPeerRange("0.1.7-rc.2", range));
  assert.ok(satisfiesPeerRange("0.2.0-rc.2", range));
  assert.ok(!satisfiesPeerRange("0.1.6", range));
  assert.ok(!satisfiesPeerRange("0.3.0", range));
  assert.ok(!satisfiesPeerRange("1.0.0", range));
});

test("minPeerVersion reads the declared floor of the range", () => {
  assert.equal(minPeerVersion(">=0.1.7-rc.1 <0.3.0"), "0.1.7-rc.1");
  assert.deepEqual(peerRangeBounds(">=0.1.7-rc.1 <0.3.0"), {
    low: "0.1.7-rc.1",
    high: "0.3.0",
  });
});
