const legislators = [
  {
    name: "Brian Evans",
    district: 68,
    party: "Republican",
    vote: "YES on HB1001"
  },
  {
    name: "Andrew Collins",
    district: 73,
    party: "Democrat",
    vote: "NO on HB1001"
  }
];

const container = document.getElementById("legislators");

container.innerHTML = "";

legislators.forEach((legislator) => {
  container.innerHTML += `
    <div class="card">
      <h2>${legislator.name}</h2>

      <p>District: ${legislator.district}</p>

      <p>Party: ${legislator.party}</p>

      <p>Latest Vote: ${legislator.vote}</p>
    </div>
  `;
});
