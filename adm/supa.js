document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("saveBtn").addEventListener("click", () => {
  console.log("Botão salvar clicado!");
  uploadJson("naosei", "configs/teste.json", { user: "Pedro", xp: 1337 });
});
});

// === ENVIAR PARA O SUPABASE
const SUPABASE_URL = "https://towutdmdlxyzbecfpunk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvd3V0ZG1kbHh5emJlY2ZwdW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NTc1MjEsImV4cCI6MjA3MjIzMzUyMX0.zb4NnVa4HUbyeXJkMhvbChveBoHkvu8pa5vVjtFmPrA";

async function uploadJson(bucket, path, data) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "PUT",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  console.log("Upload:", res.status, await res.text());
}

async function downloadJson(bucket, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!res.ok) {
    console.error("Erro:", await res.text());
    return;
  }
  const data = await res.json();
  console.log("Download:", data);
}

// === FIK