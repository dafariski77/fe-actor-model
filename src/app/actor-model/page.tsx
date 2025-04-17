'use client';

import React from 'react';
import { useMachine } from '@xstate/react';
import { createMachine, assign, fromPromise } from 'xstate';

const createItemMachine = (itemId: any) =>
  createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOgBsB7dCAqAYggsJIIDcKBrMEtLPQ0pWq0EbCpnQAXXEwDaABgC6CxYlAAHCrFzSmakAA9EAJgAc8kgHYArADZj1s7YAspgJyXnAGhABPRKYAzCRu8oEAjA7ypu7Wbh4Avgk+vDgExORUNPj0YABOeRR5JOpkUgBmRag8GGkCmcI5ovjsErr4Kir6mtrt+kYIZhY29o6mLu6ePv4IgbamJIFR8g6mds5utkkptfwZ6oWYcNo5DEzcYlw1fOmkB+LHImJtMh1KXUggPTqv-Yi2lksVlMng8xlsbms4XCpmmiDcxhI5gixkBzg2zmMbnC2xAqT2d0Oj1O+UKxVKFSq1zq+yJsBOUGarSkr06Sm6Wh+ek+AwBQMsII2lnBkOhsL8iHCgQWLnmgOM8ks8mhK1x+NuJHK6FwZEgdAASgBRAAq+oAmh8NJy+jzEJ5bCRXDZ5IrrFDsdY4YNXIs3IEbFLHMKbMYkskQPgKBA4Pp1QIOb1fraEABaWxetNq3YaoTZKAJrn4P4ITFe8LyZyLf3WFbOezgyxuLM3er3I702gFm2gAbOQHA53KwLyayBZzWSxe0zhEgAmu14zQ5zyWxbcNxjKYCioUpgSSQLtJnsBKEkFdRZfzZWAqduKyX1HmcJ2SwRZs00hanUHz7fbuGE8Z3PGtLyfG8JW9BZomdcJPCVSIHDDBIgA */
    id: `item-${itemId}`,
    initial: 'loading',
    context: {
      id: itemId,
      details: null,
      error: null,
    },
    states: {
      loading: {
        invoke: {
          src: 'fetchItemDetails',
          onDone: {
            target: 'processing',
            actions: assign(({ event }) => ({
              details: event.output,
            })),
          },
          onError: {
            target: 'failed',
            actions: assign(({ event }) => ({
              error: event.error,
            })),
          },
        },
      },
      processing: {
        invoke: {
          src: 'processItem',
          onDone: 'completed',
          onError: {
            target: 'failed',
            actions: assign(({ event }) => ({
              error: event.error,
            })),
          },
        },
      },
      completed: {
        type: 'final',
      },
      failed: {
        on: {
          RETRY: 'loading',
        },
      },
    },
  });

// Main Workflow Machine
const workflowMachine = createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QHcD2AnA1gMwDauQDp8BDCASwDsoBiCVSsQqgN1UybSzwONTKpQErVAGMSAF3IMA2gAYAuvIWJQAB1SxyUhqpAAPRACYArAGZCATgAsZgOxmAHAEYAbHdsnH1gDQgAnojOJkaEdnLOcnJm1s5mrnJGzgC+yX5cOPhEpBTUNGDo6BiEariS2BgAtoQZPNn8uUIi4jqUysp6GlqteoYIRmZyhCHWlnauZmZGEybjfoEIZuZWjkZGdpaODqbmqekYmbxqRaJwWnkASgCiACoXAJoA+gCSN1cAsh1IIF3a0pS9RDWVZhFxJBImdzWNZ2eaIAC0IWG9hCIy2jkmllcexAtSyhGwJHIuEgNGud3uX3Umj+um+fXWQxM1lcjncrOC0OccP6CSscgcck2zPBRlSaRAlFQEDgejxBE6NJ69IRrh58Oc1iGSVM61crksliMWusOPl9QE1EV3X+gIQ0J5zjsoRMzLi1gcGImckcZoOdRKJzOgmttIBKoQzJMhCSWxCjlWHixjudVg2kRcZksJmcWNNEvNBKJJIgoeVoD6rtCRixW11WZrRh5NechH1dnCmrs5lcNfFySAA */
  id: 'workflow',
  initial: 'loading',
  context: {
    items: [],
    itemActors: {},
    error: null,
  },
  states: {
    loading: {
      invoke: {
        src: 'fetchItems',
        onDone: {
          target: 'processing',
          actions: assign({
            items: ({ event }) => event.output,
            itemActors: ({ event, spawn }) => {
              const itemActors = {};
              event.output.forEach((item) => {
                itemActors[item.id] = spawn(
                  createItemMachine(item.id).provide({
                    actors: {
                      fetchItemDetails: fromPromise(() => {
                        return fetch(
                          `http://localhost:4000/api/items/${item.id}`,
                        ).then((res) => {
                          if (!res.ok) throw new Error('Failed to fetch item');
                          return res.json();
                        });
                      }),
                      processItem: fromPromise(() => {
                        return fetch(
                          `http://localhost:4000/api/items/${item.id}/process`,
                          {
                            method: 'POST',
                          },
                        ).then((res) => {
                          if (!res.ok)
                            throw new Error('Failed to process item');
                          return res.json();
                        });
                      }),
                    },
                  }),
                  {
                    id: `item-${item.id}`,
                  },
                );
              });
              return itemActors;
            },
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    processing: {
      on: {
        RETRY_ITEM: {
          actions: ({ context, event }) => {
            const { itemId } = event;
            if (context.itemActors[itemId]) {
              context.itemActors[itemId].send('RETRY');
            }
          },
        },
      },
    },
    failed: {
      on: {
        RETRY: 'loading',
      },
    },
  },
});

export default function MachinePage() {
  const [state, send] = useMachine(
    workflowMachine.provide({
      actors: {
        fetchItems: fromPromise(() => {
          return fetch('http://localhost:4000/api/items').then((res) => {
            if (!res.ok) throw new Error('Failed to fetch items');
            return res.json();
          });
        }),
      },
    }),
  );

  const { items, itemActors, error } = state.context;

  const getItemState = (itemId) => {
    if (!itemActors[itemId]) return null;
    return itemActors[itemId].getSnapshot();
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Actor Model Page Loaded</h1>
      <div className="mb-4">Current state: {state.value}</div>

      {state.matches('loading') && (
        <div className="text-blue-500">Loading data...</div>
      )}
      {error && <div className="text-red-500">Error: {error.message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const itemState = getItemState(item.id);
          return (
            <div key={item.id} className="border p-4 rounded">
              <h2 className="font-bold">{item.name}</h2>
              <div className="my-2">
                Status:{' '}
                <span
                  className={
                    itemState?.matches('completed')
                      ? 'text-green-500'
                      : itemState?.matches('failed')
                      ? 'text-red-500'
                      : 'text-yellow-500'
                  }
                >
                  {itemState?.value || 'unknown'}
                </span>
              </div>

              {itemState?.context.details && (
                <div className="mt-2">
                  <h3 className="font-semibold">Details:</h3>
                  <p>{itemState.context.details.description}</p>
                </div>
              )}

              {itemState?.matches('failed') && (
                <button
                  onClick={() => send('RETRY_ITEM', { itemId: item.id })}
                  className="mt-2 bg-blue-500 text-white px-4 py-1 rounded"
                >
                  Retry
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
