import { describe, it, expect } from "vitest";
import {
  decrementWeight,
  incrementWeight,
  decrementReps,
  incrementReps,
  WEIGHT_STEP,
  WEIGHT_MIN,
  REPS_MIN,
} from "./add-set-dialog";

describe("AddSetDialog stepper logic", () => {
  describe("weight stepper", () => {
    it("does not go below 0 when decrementing at 0", () => {
      expect(decrementWeight(0)).toBe(0);
    });

    it("decrements from 2.5 to 0", () => {
      expect(decrementWeight(2.5)).toBe(0);
    });

    it("increments from 0 to 2.5", () => {
      expect(incrementWeight(0)).toBe(2.5);
    });

    it("decrements by WEIGHT_STEP (2.5)", () => {
      expect(decrementWeight(10)).toBe(7.5);
    });

    it("increments by WEIGHT_STEP (2.5)", () => {
      expect(incrementWeight(10)).toBe(12.5);
    });

    it("has correct constants", () => {
      expect(WEIGHT_STEP).toBe(2.5);
      expect(WEIGHT_MIN).toBe(0);
    });
  });

  describe("reps stepper", () => {
    it("does not go below 1 when decrementing at 1", () => {
      expect(decrementReps(1)).toBe(1);
    });

    it("increments from 1 to 2", () => {
      expect(incrementReps(1)).toBe(2);
    });

    it("decrements from 5 to 4", () => {
      expect(decrementReps(5)).toBe(4);
    });

    it("increments from 10 to 11", () => {
      expect(incrementReps(10)).toBe(11);
    });

    it("has correct minimum", () => {
      expect(REPS_MIN).toBe(1);
    });
  });
});
