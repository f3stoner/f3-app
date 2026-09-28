import test from "node:test";
import assert from "node:assert/strict";

import {
    isPastWorkoutGracePeriod,
} from "../src/utils/date.js";

function localTime(hour, minute, second = 0, millisecond = 0) {
    return new Date(
        2026,
        0,
        15,
        hour,
        minute,
        second,
        millisecond
    );
}

test("5:30 AM workout remains actionable until 9:30 AM", () => {
    const cases = [
        ["5:29 AM", localTime(5, 29), false],
        ["5:30 AM", localTime(5, 30), false],
        ["5:31 AM", localTime(5, 31), false],
        ["7:00 AM", localTime(7, 0), false],
        ["9:29 AM", localTime(9, 29), false],
        ["9:29:59.999 AM", localTime(9, 29, 59, 999), false],
        ["9:30 AM", localTime(9, 30), true],
        ["9:31 AM", localTime(9, 31), true],
    ];

    cases.forEach(([label, now, expected]) => {
        assert.equal(
            isPastWorkoutGracePeriod("05:30", now),
            expected,
            label
        );
    });
});

test("malformed workout time fails open", () => {
    assert.equal(
        isPastWorkoutGracePeriod(
            "not-a-time",
            localTime(12, 0)
        ),
        false
    );
});
