import time

class Planner:
    def execute(self):
        # Your planner code here
        print('Planner is running...')

class Executor:
    def execute(self):
        # Your executor code here
        print('Executor is running...')

# Main loop
if __name__ == '__main__':
    planner = Planner()
    executor = Executor()
    while True:
        planner.execute()
        executor.execute()
        time.sleep(1)  # Adjust sleep as necessary
