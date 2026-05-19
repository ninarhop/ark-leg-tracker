console.log("app.js loaded");

const container = document.getElementById("legislators");
const searchInput = document.getElementById("searchInput");

let allLegislators = [];
let allBills = [];

async function loadData() {

  try {

    const legislatorsResponse = await fetch("legislators.json");
    allLegislators = await legislatorsResponse.json();

    console.log(allLegislators);

  } catch (error) {
    console.error("Legislators failed", error);
  }

  try {

    const billsResponse = await fetch("bills.json");
    allBills = await billsResponse.json();

    console.log(allBills);

  } catch (error) {
    console.error("Bills failed", error);
  }

  renderLegislators(allLegislators);
  renderBills(allBills);
}

function renderLegislators(list) {

  container.innerHTML = "<h2>Legislators</h2>";

  list.forEach((legislator) => {

    container.innerHTML += `
      <div class="card">
        <h2>${legislator.name || "Unknown"}</h2>

        <p>District: ${legislator.district || ""}</p>

        <p>Role: ${legislator.role || ""}</p>

        <p>Party ID: ${legislator.party_id || ""}</p>
      </div>
    `;
  });
}

function renderBills(list) {

  const billsSection = document.createElement("section");

  billsSection.innerHTML = `<h2>Bills</h2>`;

  list.forEach((bill) => {

    billsSection.innerHTML += `
      <div class="card">
        <h2>${bill.bill_number || ""}</h2>

        <p>${bill.title || ""}</p>
      </div>
    `;
  });

  document.body.appendChild(billsSection);
}

searchInput.addEventListener("input", () => {

  const searchTerm = searchInput.value.toLowerCase();

  const filteredLegislators = allLegislators.filter((legislator) => {

    return (
      String(legislator.name || "").toLowerCase().includes(searchTerm)
    );
  });

  renderLegislators(filteredLegislators);
});

loadData();
