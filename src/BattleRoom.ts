import {Client, Room} from "colyseus";
import {ArraySchema, MapSchema, Schema, type} from "@colyseus/schema";

class Player extends Schema {
    @type('uint8')
    order: number = 0;

    @type('string')
    name: String = "Player";

    @type("boolean")
    connected: boolean = true;


    constructor(order: number, name: String) {
        super();
        this.order = order;
        this.name = name;
    }
}

class GameState extends Schema {
    @type(["uint8"])
    map: number[] = new ArraySchema<number>(0, 0, 0, 0, 0, 0, 0, 0, 0);

    @type("boolean")
    waitingForOpponent: boolean = true;

    @type("number")
    turn = 1;

    @type("boolean")
    started = false

    @type("boolean")
    finished = false

    @type("boolean")
    opDeserted = false

    @type("uint8")
    winner = 0

    @type("uint8")
    winType = 0

    @type("number")
    nextTurn = 0;

    @type({map: Player})
    entities = new MapSchema<Player>();
}

export class BattleRoom extends Room {

    maxClients = 2;

    playerOrder = 0;
    step = 0;

    onCreate(options: any) {
        this.setState(new GameState());

        console.log("Room created", options, this.state.map);

        this.onMessage("pick", (client, message) => {
            let index = parseInt(message);

            if (
                !this.state.finished && this.state.started && !this.state.opDeserted &&
                Number.isInteger(index) && index >= 0 && index <= 9 && this.state.map[index] === 0 &&
                this.state.turn === this.state.entities[client.sessionId].order
            ) {
                this.state.map[index] = this.state.turn;
                this.state.turn = 1 + (this.state.turn) % 2;
                this.step++;

                if (this.step === 9) {
                    this.state.finished = true;
                }


                let [won, type] = this.checkWin()

                if (won > 0) {
                    this.state.winType = type;
                    this.state.finished = true;
                    this.state.winner = won;
                }
            }
        });
    }

    private checkWin(): number[] {
        let m = this.state.map;

        if (m[0] > 0 && m[4] == m[0] && m[8] == m[0]) { // 1st diagonal
            return [m[0], 1];
        } else if (m[2] > 0 && m[2] == m[4] && m[2] == m[6]) { // 2nd diagonal
            return [m[6], 2];
        } else if (m[0] > 0 && m[0] == m[1] && m[0] == m[2]) { // 1st h line
            return [m[0], 3];
        } else if (m[3] > 0 && m[3] == m[4] && m[3] == m[5]) { // 2nd h line
            return [m[3], 4];
        } else if (m[6] > 0 && m[6] == m[7] && m[6] == m[8]) { // 3rd h line
            return [m[6], 5];
        } else if (m[0] > 0 && m[0] == m[3] && m[0] == m[6]) { // 1st v line
            return [m[0], 6];
        } else if (m[1] > 0 && m[1] == m[4] && m[1] == m[7]) { // 2nd v line
            return [m[1], 7];
        } else if (m[2] > 0 && m[2] == m[5] && m[2] == m[8]) { // 3rd v line
            return [m[2], 8];
        }

        return [0, 0]
    }

    async onJoin(client: Client, options: any) {
        console.log("Client joined", client.id, options)

        this.state.entities[client.sessionId] = new Player(++this.playerOrder, options.name);

        if (this.hasReachedMaxClients()) {
            this.state.waitingForOpponent = false;
            this.state.started = true;
            await this.lock()
        }
    }

    async onLeave(client: Client, consented: boolean) {
        try {
            if (consented) {
                throw new Error("left");
            }

            this.state.entities[client.sessionId].connected = false;
            console.log("Wait for reconnect", client.sessionId);

            await this.allowReconnection(client, 60)

            this.state.entities[client.sessionId].connected = true;
            console.log("Reconnected", client.sessionId);

        } catch (e) {
            if (this.state.started && !this.state.finished) {
                this.state.opDeserted = true;
                this.state.finished = true;
                this.state.winner = this.state.entities[client.sessionId].order === 1 ? 2 : 1;
            }

            console.log("Perm. left", client.sessionId);
            delete this.state.entities[client.sessionId];
        }

    }

    onDispose() {
        console.log("On dispose")
    }
}
