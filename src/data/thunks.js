import { logError } from '@edx/frontend-platform/logging';
import {
  fetchExamAttemptsData,
  createExamAttempt,
  stopAttempt,
  continueAttempt,
  submitAttempt,
  pollExamAttempt,
} from './api';
import { isEmpty } from '../helpers';
import {
  setIsLoading,
  setExamState,
  expireExamAttempt,
  setActiveAttempt,
} from './slice';
import { ExamStatus } from '../constants';

function updateAttemptAfter(courseId, sequenceId, promise = null, noLoading = false) {
  return async (dispatch) => {
    let data;
    if (!noLoading) { dispatch(setIsLoading({ isLoading: true })); }
    if (promise) {
      data = await promise.catch(err => err);
      if (!data || !data.exam_attempt_id) {
        if (!noLoading) { dispatch(setIsLoading({ isLoading: false })); }
        return;
      }
    }

    const attemptData = await fetchExamAttemptsData(courseId, sequenceId);
    dispatch(setExamState({
      exam: attemptData.exam,
      activeAttempt: !isEmpty(attemptData.active_attempt) ? attemptData.active_attempt : null,
    }));
    if (!noLoading) { dispatch(setIsLoading({ isLoading: false })); }
  };
}

export function getExamAttemptsData(courseId, sequenceId) {
  return updateAttemptAfter(courseId, sequenceId);
}

export function startExam() {
  return async (dispatch, getState) => {
    const { exam } = getState().examState;
    if (!exam.id) {
      logError('Failed to start exam. No exam id.');
      return;
    }
    await updateAttemptAfter(
      exam.course_id, exam.content_id, createExamAttempt(exam.id),
    )(dispatch);
  };
}

/**
 * Poll exam active attempt status.
 * @param url - poll attempt url
 */
export function pollAttempt(url) {
  return async (dispatch, getState) => {
    const currentAttempt = getState().examState.activeAttempt;

    // If the learner is in a state where they've finished the exam
    // and the attempt can be submitted (i.e. they are "ready_to_submit"),
    // don't ping the proctoring app (which action could move
    // the attempt into an error state).
    if (currentAttempt && currentAttempt.attempt_status === ExamStatus.READY_TO_SUBMIT) {
      return;
    }

    const data = await pollExamAttempt(url).catch(
      err => logError(err),
    );
    const updatedAttempt = {
      ...currentAttempt,
      time_remaining_seconds: data.time_remaining_seconds,
      accessibility_time_string: data.accessibility_time_string,
      attempt_status: data.status,
    };
    dispatch(setActiveAttempt({
      activeAttempt: updatedAttempt,
    }));
    if (data.status === ExamStatus.SUBMITTED) {
      dispatch(expireExamAttempt());
    }
  };
}

export function stopExam() {
  return async (dispatch, getState) => {
    const { exam } = getState().examState;
    const attemptId = exam.attempt.attempt_id;
    if (!attemptId) {
      logError('Failed to stop exam. No attempt id.');
      return;
    }
    await updateAttemptAfter(
      exam.course_id, exam.content_id, stopAttempt(attemptId), true,
    )(dispatch);
  };
}

export function continueExam() {
  return async (dispatch, getState) => {
    const { exam } = getState().examState;
    const attemptId = exam.attempt.attempt_id;
    if (!attemptId) {
      logError('Failed to continue exam. No attempt id.');
      return;
    }
    await updateAttemptAfter(
      exam.course_id, exam.content_id, continueAttempt(attemptId), true,
    )(dispatch);
  };
}

export function submitExam() {
  return async (dispatch, getState) => {
    const { exam } = getState().examState;
    const attemptId = exam.attempt.attempt_id;
    if (!attemptId) {
      logError('Failed to submit exam. No attempt id.');
      return;
    }
    await updateAttemptAfter(
      exam.course_id, exam.content_id, submitAttempt(attemptId),
    )(dispatch);
  };
}

export function expireExam() {
  return async (dispatch, getState) => {
    const { exam } = getState().examState;
    const attemptId = exam.attempt.attempt_id;
    if (!attemptId) {
      logError('Failed to expire exam. No attempt id.');
      return;
    }
    await updateAttemptAfter(
      exam.course_id, exam.content_id, submitAttempt(attemptId),
    )(dispatch);
    dispatch(expireExamAttempt());
  };
}