const container = document.getElementById("legislators");
const searchInput = document.getElementById("searchInput");

let allLegislators = [];
let allBills = [];

async function loadData() {
  const legislatorsResponse = await fetch("legislators.json");
  allLegislators = await legislatorsResponse.json();

  const billsResponse = await fetch("bills.json");
  allBills = await billsResponse.json();

  renderLegislators(allLegislators);
  renderBills(allBills);
}

function renderLegislators(list) {
  container.innerHTML = "";

  list.forEach((legislator) => {
    container.innerHTML += `
      <div class="card">
        <h2>${legislator.name || "Unknown"}</h2>
        <p><strong>People ID:</strong> ${legislator.people_id || ""}</p>
        <p><strong>District:</strong> ${legislator.district || ""}</p>
        <p><strong>Role:</strong> ${legislator.role || ""}</p>
        <p><strong>Party ID:</strong> ${legislator.party_id || ""}</p>
      </div>
    `;
  });
}

function renderBills(list) {
  const oldBills = document.getElementById("billsSection");
  if (oldBills) oldBills.remove();

  const billsSection = document.createElement("section");
  billsSection.id = "billsSection";
  billsSection.innerHTML = `<h2>Bills</h2>`;

  list.forEach((bill) => {
    billsSection.innerHTML += `
      <div class="card">
        <h2>${bill.bill_number || ""}</h2>
        <p><strong>Title:</strong> ${bill.title || ""}</p>
        <p><strong>Description:</strong> ${bill.description || ""}</p>
        <p><strong>Status:</strong> ${bill.status || ""}</p>
        <p><strong>Last Action:</strong> ${bill.last_action || ""}</p>
        <p><a href="${bill.state_link || "#"}" target="_blank">View official bill</a></p>
      </div>
    `;
  });

  document.body.appendChild(billsSection);
}

searchInput.addEventListener("input", () => {
  const searchTerm = searchInput.value.toLowerCase();

  const filteredLegislators = allLegislators.filter((legislator) => {
    return (
      String(legislator.name || "").toLowerCase().includes(searchTerm) ||
      String(legislator.district || "").toLowerCase().includes(searchTerm) ||
      String(legislator.role || "").toLowerCase().includes(searchTerm) ||
      String(legislator.people_id || "").toLowerCase().includes(searchTerm)
    );
  });

  const filteredBills = allBills.filter((bill) => {
    return (
      String(bill.bill_number || "").toLowerCase().includes(searchTerm) ||
      String(bill.title || "").toLowerCase().includes(searchTerm) ||
      String(bill.description || "").toLowerCase().includes(searchTerm) ||
      String(bill.status || "").toLowerCase().includes(searchTerm)
    );
  });

  renderLegislators(filteredLegislators);
  renderBills(filteredBills);
});

loadData();
