const container = document.getElementById("legislators");
const searchInput = document.getElementById("searchInput");

function renderLegislators(list) {
  container.innerHTML = "";

  list.forEach((legislator) => {
    const votesHtml = legislator.latestVotes
      .map(vote => `<li>${vote.bill}: ${vote.vote}</li>`)
      .join("");

    container.innerHTML += `
      <div class="card">
        <h2>${legislator.name}</h2>

        <p><strong>Chamber:</strong> ${legislator.chamber}</p>
        <p><strong>District:</strong> ${legislator.district}</p>
        <p><strong>Party:</strong> ${legislator.party}</p>

        <h3>Recent Votes</h3>
        <ul>${votesHtml}</ul>
      </div>
    `;
  });
}

searchInput.addEventListener("input", () => {
  const searchTerm = searchInput.value.toLowerCase();

  const filtered = legislators.filter((legislator) => {
    return (
      legislator.name.toLowerCase().includes(searchTerm) ||
      legislator.party.toLowerCase().includes(searchTerm) ||
      legislator.chamber.toLowerCase().includes(searchTerm) ||
      String(legislator.district).includes(searchTerm)
    );
  });

  renderLegislators(filtered);
});

renderLegislators(legislators);
