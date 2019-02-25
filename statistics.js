const fetch = require('node-fetch');
const table = require('text-table');

exports.handler = async (event, context, callback) => {
    console.log('Starting lambda');

    const showSenior = event.senior;
    const showKick = event.kick;

    let clanDataPromise = fetch('https://api.royaleapi.com/clan/' + event.clan_id, {
        headers: { auth: process.env.ROYALE_API_KEY },
    });

    let warlogPromise = fetch('https://api.royaleapi.com/clan/' + event.clan_id + '/warlog', {
        headers: { auth: process.env.ROYALE_API_KEY },
    });

    [clanDataPromise, warlogPromise] = await Promise.all([clanDataPromise, warlogPromise]);

    let clanData = clanDataPromise.json();
    let warlog = warlogPromise.json();

    [clanData, warlog] = await Promise.all([clanData, warlog]);

    const warData = warbattleStatistics(warlog);

    const callbackResponse = [];

    clanData.members.forEach(member => {
        const percent = (warData[member.tag] && warData[member.tag].percent) || -1;
        const played = (warData[member.tag] && warData[member.tag].played) || 0;
        callbackResponse.push({
            name: member.name,
            tag: member.tag,
            percent,
            played,
            donated: member.donations,
            received: member.donationsReceived,
            role: member.role,
            senior: played > 5,
            kick: member.donations < 150 || member.donationsReceived < 200,
        });
    });

    await writeDescription(event.discord_key, showSenior, showKick);

    const outputArray = [
        ['Navn', 'CW %', 'Splt', 'Ut', 'Inn', 'Sen', showKick ? 'Kick?' : '', showSenior ? 'Sen?' : ''],
    ].concat(
        callbackResponse
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
            .map(rate => [
                rate.name,
                rate.percent === -1 ? 'MIA' : rate.percent + '%',
                rate.played,
                rate.donated,
                rate.received,
                rate.role === 'member'
                    ? '👶'
                    : rate.role === 'elder'
                        ? '👨'
                        : rate.role === 'coLeader' ? '👮' : rate.role === 'leader' ? '🤶' : '',
                showKick ? (rate.role === 'coLeader' || rate.role === 'leader' ? '😇' : rate.kick ? '👟' : '👌') : '',
                showSenior
                    ? rate.role === 'coLeader' || rate.role === 'leader' ? '😇' : rate.senior ? '😀' : '❌'
                    : '',
            ])
    );

    console.log('outputArray', outputArray);

    await sendTableToDiscord(table(outputArray), event.discord_key, true);
};

const writeDescription = (discord, showSenior, showKick) => {
    return fetch('https://discordapp.com/api/webhooks/' + discord, {
        method: 'POST',
        body: JSON.stringify({
            content:
                'CW % er vinstraten i klankrig, Splt er antall kamper siste 10 runder, Ut er antall donerte, ' +
                'Inn er antall kort mottatt, Sen er nåværende rolle' +
                (showSenior
                    ? ', Sen? er om du er kvalifisert til å bli senior for denne uken (6 spilte kamper siste 10 runder).'
                    : '.') +
                (showKick
                    ? 'Kick? betyr at brukeren blir sparket om den ikke når målet om minimum 150 donasjoner og 5 forespørsler.'
                    : ''),
        }),
        headers: { 'Content-Type': 'application/json' },
    });
};

const sendTableToDiscord = async (tableText, discordKey, wait) => {
    for (let i = 0; i < tableText.split('\n').length; i += 20) {
        var responseText =
            '```' +
            tableText
                .split('\n')
                .slice(i, i + 20)
                .join('\n') +
            '```';
        console.log('Generated response:', responseText);
        const webhook = fetch('https://discordapp.com/api/webhooks/' + discordKey, {
            method: 'POST',
            body: JSON.stringify({ content: responseText }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(response => console.log('Request ok:', response.statusText))
            .catch(err => console.log('Request failed:', err));
        if (wait) {
            await Promise.all([webhook]);
        }
    }
};
const warbattleStatistics = warlog => {
    const data = {};
    warlog.forEach(war => {
        war.participants.forEach(participant => {
            if (!data[participant.tag]) {
                data[participant.tag] = {
                    played: 0,
                    won: 0,
                };
            }

            data[participant.tag].played += participant.battlesPlayed > 0 ? participant.battlesPlayed : 1;
            data[participant.tag].won += participant.wins;
        });
    });
    Object.keys(data).forEach(tag => {
        data[tag].percent = (100 * data[tag].won / data[tag].played).toFixed();
    });
    return data;
};
