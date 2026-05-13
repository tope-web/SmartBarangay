// supabase.js
// Replace with your actual Supabase credentials
const SUPABASE_URL = "sb_publishable_9FxfZ5W1w1DXaDcyDiCRTw_npdAxw5I";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlbWt3cmFsYmpuZGthdHprbXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTUzMzYsImV4cCI6MjA5NDE3MTMzNn0.5jxaGsEMlmKola1RvSAmBt3PLY3thHnOuf6NXovxkKo";

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to check connection
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('residents').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('✅ Supabase connected successfully!');
        return true;
    } catch (err) {
        console.error('❌ Supabase connection failed:', err.message);
        return false;
    }
}

// Export for use in other files
window.supabaseClient = supabase;
window.testSupabaseConnection = testSupabaseConnection;