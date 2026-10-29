import { supabase } from '../src/services/supabase.js';

async function checkMarks() {
  const { data: marks, error } = await supabase
    .from('marks')
    .select('student_id, subject_id, terminal, total_marks')
    .limit(20);
  console.log('Sample marks:', { count: marks?.length, error, marks: marks?.slice(0, 5) });

  const { data: summaries, error: sErr } = await supabase
    .from('result_summary')
    .select('student_id, terminal, total_obtained, percentage, division, rank')
    .limit(20);
  console.log('Sample result_summary:', { count: summaries?.length, sErr, summaries: summaries?.slice(0, 5) });
}

checkMarks();

