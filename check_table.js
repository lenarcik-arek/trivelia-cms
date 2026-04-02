import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://thhcnhsnlugnqntaabff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoaGNuaHNubHVnbnFudGFhYmZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzM4NDksImV4cCI6MjA4MTkwOTg0OX0.GCB9xuRcCxrDtP7_HiPCyy4UtS9VuExVxGLFU8EfwbU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Use a query that will fail but give us info? No, let's use the API to list columns if possible
  // Or just try selecting 'email' and 'user_id'
  const { error: e1 } = await supabase.from('cms_admins').select('email').limit(1);
  const { error: e2 } = await supabase.from('cms_admins').select('user_id').limit(1);
  console.log('Error email:', e1 ? e1.message : 'OK');
  console.log('Error user_id:', e2 ? e2.message : 'OK');
}

check();
