// Working with APIs
//Calling the selection from the bar
const gameLog = document.getElementById('select');

gameLog.onchange = async function(){
    let resetCanvas = function(){
        $('#gameLog').remove(); // this is my <canvas> element
        $('#win-loss').append('<canvas id="gameLog"><canvas>');
    }
    document.getElementById('place-holder').style.display = 'none';
    document.getElementById('place-holder2').style.display = 'none';

    let selectScore = [];
    let oppScore = [];
    let oppTeam = [];
    let homeAway = [];
    let selectedTeam = [];
    let winLoss = [];
    let player = [];
    let team = this.value;
    if(team == "Choose a Team") return;
    selectedTeam.push(this.value);
    async function nba(){    
        const response = await fetch('https://www.balldontlie.io/api/v1/games?seasons[]=2018&per_page=100');
        const pgTrack = await response.json();
        let currentPage = 1;
        let totalPages = pgTrack.meta.total_pages; 
        while(currentPage<=5){
        let nba_url = `https://www.balldontlie.io/api/v1/games?seasons[]=2018&per_page=100&page=${currentPage}`    
        const response = await fetch(nba_url);
        const nba = await response.json();
        for(i=0; i<nba.data.length;i++) {
            if(selectedTeam[0] == nba.data[i].home_team.full_name){
            selectScore.push(nba.data[i].home_team_score);
            oppScore.push(nba.data[i].visitor_team_score);
            oppTeam.push(nba.data[i].visitor_team.full_name);
            homeAway.push('Home');
            if(nba.data[i].home_team_score > nba.data[i].visitor_team_score){   winLoss.push('Win');
            }else{
                winLoss.push('Loss');
            }
            }else if(selectedTeam[0] == nba.data[i].visitor_team.full_name){
            oppScore.push(nba.data[i].home_team_score);
            oppTeam.push(nba.data[i].home_team.full_name);
            selectScore.push(nba.data[i].visitor_team_score);
            homeAway.push('Visitor');
            if(nba.data[i].home_team_score > nba.data[i].visitor_team_score){   winLoss.push('Loss');
        }else{
            winLoss.push('Win');
        }
            }else{
                
            }
        }
        currentPage++;
        }
     
    }
    let selectLine = {
        label: `${selectedTeam[0]} Score`,
        data: selectScore,
        lineTension: 0,
        fill: false,
        borderColor: 'red'
  };
    let vsLine = {
        label: "Opponent Score",
        labels: oppTeam,
        data: oppScore,
        lineTension: 0,
        fill: false,
        borderColor: 'blue'
  };
        
    async function chartNBA(){
        await nba();
    const ctx =  document.getElementById('gameLog').getContext('2d');
    const nbaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: oppTeam,
            datasets: [selectLine, vsLine]
        
        },
        options: {
          
            scales: {
                yAxes: [{
                    ticks: {
                        suggestedMin: 80,
                    }
                }]
            }
        }
    });
    
    }
    chartNBA();
}




