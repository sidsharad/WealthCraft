import fetch from "node-fetch";

async function main() {
  console.log("--- Step 4, 5, 6: Verify Version Consistency via API ---");
  
  // 1. First, create a new room by hitting the start game API directly or just creating a local room
  // Since creating a room might be complex, let's just create one manually in DB to test the action endpoint.
  
  // Actually, we can just hit the /api/rooms endpoint to create a room if it exists, but the game has a lobby.
  // Instead, let's simulate the API call to /api/rooms using NextJS local server if it is running at localhost:3000
  
  try {
    const res = await fetch("http://localhost:3000/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "local", playerNames: ["Player 1", "Player 2"], botTypes: [] })
    });
    
    if (!res.ok) {
      console.log("Failed to create room:", await res.text());
      return;
    }
    
    const { room } = await res.json();
    const roomId = room.id;
    console.log("Created room:", roomId);
    
    // Now trigger a roll action
    console.log("\n-> Triggering ROLL action...");
    const rollRes = await fetch(`http://localhost:3000/api/rooms/${roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "roll", payload: { dice: 4 } })
    });
    const rollData = await rollRes.json();
    console.log("Roll response:", {
      gameVersion: rollData.gameVersion,
      gameStateVersion: rollData.gameState?.version
    });
    
    // Now trigger an end-turn action
    console.log("\n-> Triggering END-TURN action...");
    const endTurnRes = await fetch(`http://localhost:3000/api/rooms/${roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end-turn", payload: {} })
    });
    const endTurnData = await endTurnRes.json();
    console.log("End Turn response:", {
      gameVersion: endTurnData.gameVersion,
      gameStateVersion: endTurnData.gameState?.version
    });

  } catch (err) {
    console.error("Error connecting to localhost:3000:", err);
  }

}

main();
