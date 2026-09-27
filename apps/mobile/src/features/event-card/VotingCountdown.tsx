import React, { useEffect, useState } from "react";
import { Txt } from "../../ui";
import { votingTimeRemaining } from "./cardState";

interface Props {
  voteClosesAt: string;
}

export function VotingCountdown({ voteClosesAt }: Props) {
  const [timeStr, setTimeStr] = useState(() => votingTimeRemaining(voteClosesAt));

  useEffect(() => {
    setTimeStr(votingTimeRemaining(voteClosesAt));
    const interval = setInterval(() => {
      const updated = votingTimeRemaining(voteClosesAt);
      setTimeStr(updated);
      if (updated === "Voting ending…") {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [voteClosesAt]);

  return (
    <Txt variant="small" numeric>
      {timeStr}
    </Txt>
  );
}
