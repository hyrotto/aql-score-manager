const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const channel = supabase
  .channel('test')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, (payload) => {
    console.log('Realtime event received:', payload);
  })
  .subscribe((status) => {
    console.log('Subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('Successfully subscribed. Realtime is enabled!');
      process.exit(0);
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.log('Failed to subscribe. Realtime might not be enabled.');
      process.exit(1);
    }
  });

setTimeout(() => {
  console.log('Timeout waiting for status');
  process.exit(1);
}, 5000);
