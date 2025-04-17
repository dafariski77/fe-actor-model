'use client';

import React, { useState, useEffect } from 'react';

interface Item {
  id: string;
  name: string;
  details?: {
    description: string;
  };
}

type TaskStatus = 'pending' | 'retrying' | 'completed' | 'failed';
type TaskStatusMap = Record<string, TaskStatus>;
type CurrentStep = 'loading' | 'ready' | 'error';

export default function TraditionalPage() {
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<CurrentStep>('loading');
  const [taskStatus, setTaskStatus] = useState<TaskStatusMap>({});

  useEffect(() => {
    const fetchInitialData = async (): Promise<void> => {
      try {
        const response = await fetch('http://localhost:4000/api/items');

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const items: Item[] = await response.json();
        setData(items);
        setCurrentStep('ready');

        // Initialize task status
        const initialStatus: TaskStatusMap = {};
        items.forEach((item) => {
          initialStatus[item.id] = 'pending';
        });
        setTaskStatus(initialStatus);
      } catch (err) {
        console.error('Error in traditional workflow:', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
        setCurrentStep('error');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const handleRetry = async (itemId: string): Promise<void> => {
    setTaskStatus((prev) => ({ ...prev, [itemId]: 'retrying' }));

    try {
      const processResponse = await fetch(`http://localhost:4000/api/item/${itemId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });

      if (!processResponse.ok) {
        throw new Error(`Retry failed for item ${itemId}`);
      }

      setTaskStatus((prev) => ({ ...prev, [itemId]: 'completed' }));
    } catch (err) {
      console.error(`Retry error for item ${itemId}:`, err);
      setTaskStatus((prev) => ({ ...prev, [itemId]: 'failed' }));
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Traditional Page Loaded</h1>
      <div className="mb-4">Current step: {currentStep}</div>

      {loading && <div className="text-blue-500">Loading data...</div>}
      {error && <div className="text-red-500">Error: {error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((item) => (
          <div key={item.id} className="border p-4 rounded">
            <h2 className="font-bold">{item.name}</h2>
            <div className="my-2">
              Status:{' '}
              <span
                className={
                  taskStatus[item.id] === 'completed'
                    ? 'text-green-500'
                    : taskStatus[item.id] === 'failed'
                    ? 'text-red-500'
                    : 'text-yellow-500'
                }
              >
                {taskStatus[item.id] || 'pending'}
              </span>
            </div>

            {item.details && (
              <div className="mt-2">
                <h3 className="font-semibold">Details:</h3>
                <p>{item.details.description}</p>
              </div>
            )}

            {taskStatus[item.id] === 'failed' && (
              <button
                onClick={() => handleRetry(item.id)}
                className="mt-2 bg-blue-500 text-white px-4 py-1 rounded"
              >
                Retry
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
