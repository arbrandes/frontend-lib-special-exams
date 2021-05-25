import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useToggle } from '@edx/paragon';
import { Emitter } from '../data';
import {
  TIMER_IS_CRITICALLY_LOW,
  TIMER_IS_LOW,
  TIMER_LIMIT_REACHED,
} from './events';
import { withExamStore } from '../hocs';

/* give an extra 5 seconds where the timer holds at 00:00 before page refreshes */
const GRACE_PERIOD_SECS = 5;
const POLL_INTERVAL = 60;

export const TimerContext = React.createContext({});

const mapStateToProps = (state) => {
  const { activeAttempt } = state.examState;
  return { attempt: activeAttempt };
};

const getFormattedRemainingTime = (timeLeft) => ({
  hours: Math.floor(timeLeft / (60 * 60)),
  minutes: Math.floor((timeLeft / 60) % 60),
  seconds: Math.floor(timeLeft % 60),
});

const TimerServiceProvider = ({ children, attempt, pollHandler }) => {
  const [timeState, setTimeState] = useState({});
  const [limitReached, setLimitReached] = useToggle(false);
  const {
    time_remaining_seconds: timeRemaining,
    critically_low_threshold_sec: criticalLowTime,
    low_threshold_sec: lowTime,
  } = attempt;
  const startValue = Math.floor(timeRemaining);
  const LIMIT = GRACE_PERIOD_SECS ? 0 - GRACE_PERIOD_SECS : 0;

  const getTimeString = () => Object.values(timeState).map(
    item => {
      // Do not show timer negative value.
      // User will see 00:00:00 during grace period if any.
      const value = item < 0 ? 0 : item;
      return (value < 10 ? `0${value}` : value);
    },
  ).join(':');

  const pollExam = () => {
    const url = attempt.exam_started_poll_url;
    const queryString = `?sourceid=in_exam&proctored=${attempt.taking_as_proctored}`;
    pollHandler(url + queryString);
  };

  const processTimeLeft = (timer, secondsLeft) => {
    if (secondsLeft <= criticalLowTime) {
      Emitter.emit(TIMER_IS_CRITICALLY_LOW);
    } else if (secondsLeft <= lowTime) {
      Emitter.emit(TIMER_IS_LOW);
    }
    if (!limitReached && secondsLeft < LIMIT) {
      clearInterval(timer);
      setLimitReached();
      Emitter.emit(TIMER_LIMIT_REACHED);
    }
  };

  useEffect(() => {
    let secondsLeft = startValue;
    let timerTick = 0;
    const interval = setInterval(() => {
      secondsLeft -= 1;
      timerTick += 1;
      setTimeState(getFormattedRemainingTime(secondsLeft));
      processTimeLeft(interval, secondsLeft);
      // no polling during grace period
      if (timerTick % POLL_INTERVAL === 0 && secondsLeft >= 0) {
        pollExam();
      }
    }, 1000);

    return () => { clearInterval(interval); };
  }, []);

  return (
    <TimerContext.Provider value={{
      timeState,
      getTimeString,
    }}
    >
      {children}
    </TimerContext.Provider>
  );
};

TimerServiceProvider.propTypes = {
  attempt: PropTypes.shape({
    time_remaining_seconds: PropTypes.number.isRequired,
    critically_low_threshold_sec: PropTypes.number.isRequired,
    low_threshold_sec: PropTypes.number.isRequired,
    exam_started_poll_url: PropTypes.string,
    taking_as_proctored: PropTypes.bool,
    attempt_status: PropTypes.string.isRequired,
  }).isRequired,
  children: PropTypes.element.isRequired,
  pollHandler: PropTypes.func,
};

TimerServiceProvider.defaultProps = {
  pollHandler: () => {},
};

export default withExamStore(TimerServiceProvider, mapStateToProps);